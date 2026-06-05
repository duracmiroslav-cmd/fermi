// The agent target: fermion configuring an *agent*'s persona + delivery.
// Its tools edit the bound agent's config instead of doing end-user work.
// It reuses the same runAgentConversation loop; the toolset closes over
// the target agent + owner and ignores the per-call ToolContext the loop
// passes (which carries end-user-run plumbing it doesn't need).

import type { SupabaseClient } from '@supabase/supabase-js';
import { BUILT_IN_CAPABILITIES } from '../../../shared/capabilities.ts';
import { VOICE_REPLY_MODES, findAgentById } from '../../../shared/agents.ts';
import { loadActiveCapabilities } from '../../../shared/agentCapabilities.ts';
import { DEFAULT_VISION_MODEL, resolveTextModel } from '../../../shared/constants/models.ts';
import {
  DEFAULT_TTS_MODEL,
  TTS_MODEL_IDS,
  TTS_VOICE_GENDERS,
  TTS_VOICE_IDS,
  type TtsModel,
  type TtsVoice,
  type VoiceGender,
  getTtsModelName,
  getTtsVoiceName,
  parseTtsModel,
  supportsTtsVoice,
} from '../../../shared/tts.ts';
import {
  MODEL_PROVIDERS,
  OPENROUTER_MODELS_URL,
  type CatalogModel,
  type RawOpenRouterModel,
  filterOpenRouterModels,
  modelProvider,
} from '../../../shared/openrouterModels.ts';
import type { ToolSchema, Toolset } from '../agent/tools/index.ts';
import type { FermionTarget } from './registry.ts';

const BUILTIN_SLUGS = Object.keys(BUILT_IN_CAPABILITIES);

interface UpdateAgentArgs {
  name?:                  string;
  system_prompt?:         string;
  tts_instructions?:      string;
  voice_reply_mode?:      string;
  default_text_model?:    string;
  default_vision_model?:  string;
  tts_model?:             string;
  default_tts_voice?:     string;
  normalize_traditional?: boolean;
}

interface SetCapabilitiesArgs {
  slugs?: string[];
}

// 5-min model catalog cache, per isolate. Mirrors the Nuxt picker
// endpoint's TTL; fetched lazily so a conversation that never touches
// models pays nothing.
let catalogCache: { data: CatalogModel[]; expiresAt: number } | null = null;
const getCatalog = async (): Promise<CatalogModel[]> => {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.data;
  const res = await fetch(OPENROUTER_MODELS_URL);
  if (!res.ok) throw new Error(`OpenRouter models fetch failed: ${res.status}`);
  const body = await res.json() as { data: RawOpenRouterModel[] };
  const data = filterOpenRouterModels(body.data);
  catalogCache = { data, expiresAt: Date.now() + 5 * 60 * 1000 };
  return data;
};

const schemas: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'update_agent',
      description:
        'Set the agent\'s name, persona, voice, AI models, and/or language settings. Write the system prompt as clear prose in the user\'s language, addressed to the agent ("You are…"). Pass only the fields you want to change. For models, call list_models first to get valid ids.',
      parameters: {
        type: 'object',
        properties: {
          name:          { type: 'string', description: 'Short display name, e.g. "Cafe Host".' },
          system_prompt: { type: 'string', description: 'The full persona + behavior instructions.' },
          tts_instructions: {
            type: 'string',
            description:
              'How the spoken voice should sound — tone, pace, persona (e.g. "Speak warmly and a little slowly, like a friendly cafe host."). Describe it in the user\'s words. Do NOT specify language or accent here; that is handled automatically. Pass an empty string to clear it.',
          },
          voice_reply_mode: {
            type: 'string',
            enum: [...VOICE_REPLY_MODES],
            description:
              'When the assistant replies with voice: "off" = text only, "auto" = voice only when the user sent voice, "always" = always voice.',
          },
          default_text_model: {
            type: 'string',
            description:
              'OpenRouter model id for text replies (e.g. "anthropic/claude-opus-4.7"). Call list_models for valid ids + prices. Empty string resets to the platform default.',
          },
          default_vision_model: {
            type: 'string',
            description:
              'OpenRouter model id used when a message contains an image; must be vision-capable (list_models with vision_only). Empty string resets to the platform default.',
          },
          tts_model: {
            type: 'string',
            enum: [...TTS_MODEL_IDS],
            description:
              'Speech (TTS) model. gpt-4o-mini-tts is cheapest and the only one that honors tts_instructions; tts-1 / tts-1-hd are lower-latency but ignore tone instructions and support fewer voices.',
          },
          default_tts_voice: {
            type: 'string',
            enum: [...TTS_VOICE_IDS],
            description:
              'The speaking voice. Pick by gender from the catalog in your instructions — there is no audio preview here. tts-1 / tts-1-hd only support a subset of voices.',
          },
          normalize_traditional: {
            type: 'boolean',
            description: 'Convert the assistant\'s Chinese replies to Traditional Chinese (Taiwan).',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_capabilities',
      description:
        'Set which built-in capabilities (tools) the agent can use. Pass the COMPLETE desired set of slugs; anything omitted is turned off. Some need a credential connected separately on the Connectors page before they work.',
      parameters: {
        type: 'object',
        properties: {
          slugs: {
            type:        'array',
            items:       { type: 'string', enum: BUILTIN_SLUGS },
            description: `Subset of: ${BUILTIN_SLUGS.join(', ')}.`,
          },
        },
        required: ['slugs'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_models',
      description:
        'List available AI models (id, price per million tokens, whether free / vision-capable). Call before setting a model. Narrow with a filter so the list stays short — by provider, or vision-capable only, or free only.',
      parameters: {
        type: 'object',
        properties: {
          provider: {
            type:        'string',
            enum:        [...MODEL_PROVIDERS],
            description: 'Only models from this provider.',
          },
          vision_only: {
            type:        'boolean',
            description: 'Only models that can read images (for picking a vision model).',
          },
          free_only: {
            type:        'boolean',
            description: 'Only models that cost nothing.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

// Lists the capabilities the builder may enable, so it suggests real
// slugs and flags the ones that need a credential connected first.
export const capabilityCatalog = (): string =>
  BUILTIN_SLUGS.map((slug) => {
    const c = BUILT_IN_CAPABILITIES[slug];
    const needsKey = c.credentialType === 'providers' ? ' (needs a credential connected first)' : '';
    return `- ${slug}: ${c.description}${needsKey}`;
  }).join('\n');

// Voices grouped by perceived gender, so fermion recommends one without
// any audio sample. (Perceived, not official — see TTS_VOICE_GENDERS.)
const voiceCatalog = (): string => {
  const byGender = (g: VoiceGender): string =>
    TTS_VOICE_IDS.filter(v => TTS_VOICE_GENDERS[v] === g).join(', ') || '(none)';
  return `Female: ${byGender('female')}\nMale: ${byGender('male')}\nNeutral: ${byGender('neutral')}`;
};

export interface CurrentAgent {
  name:                 string;
  systemPrompt:         string | null;
  capabilitySlugs:      string[];
  ttsInstructions:      string | null;
  voiceReplyMode:       string;
  textModel:            string;
  textModelIsDefault:   boolean;
  visionModel:          string | null;
  ttsModel:             TtsModel | null;
  ttsVoice:             TtsVoice | null;
  normalizeTraditional: boolean;
  hasAvatar:            boolean;
}

export const builderSystemPrompt = (current: CurrentAgent): string =>
  `You are fermion, fermi's setup assistant. You help a non-technical person configure their LINE assistant by talking with them; they should never have to write a "system prompt" themselves.

This is the agent's current configuration. Build on it: only change what the user asks for, and keep the rest. If the system prompt is empty, you're setting it up from scratch.
- Name: ${current.name}
- System prompt: ${current.systemPrompt && current.systemPrompt.trim() ? current.systemPrompt : '(none yet)'}
- Enabled capabilities: ${current.capabilitySlugs.length ? current.capabilitySlugs.join(', ') : '(none)'}
- Voice reply mode: ${current.voiceReplyMode}
- Voice tone instructions: ${current.ttsInstructions && current.ttsInstructions.trim() ? current.ttsInstructions : '(none)'}
- Text model: ${current.textModel}${current.textModelIsDefault ? ' (platform default)' : ''}
- Vision model (used for image messages): ${current.visionModel ?? `${DEFAULT_VISION_MODEL} (platform default)`}
- Speech model: ${current.ttsModel ? getTtsModelName(current.ttsModel) : `${getTtsModelName(DEFAULT_TTS_MODEL)} (platform default)`}
- Voice: ${current.ttsVoice ? `${getTtsVoiceName(current.ttsVoice)} (${TTS_VOICE_GENDERS[current.ttsVoice]})` : '(platform default)'}
- Convert replies to Traditional Chinese: ${current.normalizeTraditional ? 'on' : 'off'}
- Avatar: ${current.hasAvatar ? 'set' : 'not set'}

How to work:
- If the prompt is empty, open by asking what their business is or what they want the assistant to do. Ask 2-4 short questions before drafting; don't interrogate. If they're refining an existing setup, just make the change they asked for.
- Call update_agent to set a fitting name and a clear, concise system prompt (written in the user's language, addressed to the agent as "You are…"). Keep it practical: who it is, who it serves, tone, what to do, what to avoid. When revising, start from the current prompt above rather than rewriting from nothing.
- If the user wants the assistant to speak, or describes how it should sound, use update_agent: set voice_reply_mode (off / auto / always) and/or tts_instructions (the speaking tone, in their words). Don't put language or accent in tts_instructions — that's handled automatically.
- To change the voice, pick from the catalog below by gender (there's no audio preview here, so choose by gender and let the user refine) and set default_tts_voice. Note tts-1 / tts-1-hd support only a subset of voices; gpt-4o-mini-tts supports all.
- To change the AI model, call list_models first — filter it (by provider, vision_only, or free_only) so you get a short relevant list rather than everything — then set default_text_model and/or default_vision_model. The vision model is only used when a message contains an image.
- If a capability would clearly help, call set_capabilities with the full desired set (it replaces the current set, so include the ones to keep). Mention when one needs a credential connected on the Connectors page.
- After making changes, briefly tell the user what you set and invite them to test it on the right, then refine.
- Reply in the user's language. Be warm and concise. Don't expose internal jargon like "system prompt" unless they use it first.

What you can and can't change:
- You can set: name, persona, capabilities, voice reply mode, tone instructions, the voice, the text + vision models, and Traditional-Chinese conversion.
- You cannot set the avatar from here — it's uploaded on the setup form beside this chat. If the user asks, point them there and don't claim to have changed it.

Voices (by perceived gender):
${voiceCatalog()}

Available capabilities:
${capabilityCatalog()}`;

export const buildBuilderToolset = (
  admin:         SupabaseClient,
  ownerId:       string,
  targetAgentId: string,
): Toolset => {
  // The agent's effective TTS model, to validate a voice against. Reads
  // the stored value unless this same call is also setting tts_model.
  const effectiveTtsModel = async (pending?: string): Promise<TtsModel> => {
    if (pending && (TTS_MODEL_IDS as readonly string[]).includes(pending)) return pending as TtsModel;
    const { data: agent, error: agentErr } = await admin
      .from('agents')
      .select('default_tts_model')
      .eq('id', targetAgentId)
      .eq('owner_id', ownerId)
      .maybeSingle();
    if (agentErr) throw agentErr;
    return parseTtsModel(agent?.default_tts_model ?? null) ?? DEFAULT_TTS_MODEL;
  };

  const updateAgent = async (args: UpdateAgentArgs): Promise<unknown> => {
    const patch: Record<string, string | boolean | null> = {};
    if (typeof args.name === 'string' && args.name.trim()) patch.name = args.name.trim().slice(0, 60);
    if (typeof args.system_prompt === 'string') patch.system_prompt = args.system_prompt;
    // Blank clears it (stored null), so the agent falls back to the
    // default accent policy in resolveTtsInstructions.
    if (typeof args.tts_instructions === 'string') patch.tts_instructions = args.tts_instructions.trim().slice(0, 2000) || null;
    if (typeof args.voice_reply_mode === 'string') {
      if (!(VOICE_REPLY_MODES as readonly string[]).includes(args.voice_reply_mode)) {
        return { error: `voice_reply_mode must be one of: ${VOICE_REPLY_MODES.join(', ')}.` };
      }
      patch.voice_reply_mode = args.voice_reply_mode;
    }

    // Model ids are validated against the live catalog; empty clears to
    // the platform default. Fetch the catalog only if a model is set.
    const setsTextModel = typeof args.default_text_model === 'string' && args.default_text_model.trim() !== '';
    const setsVisionModel = typeof args.default_vision_model === 'string' && args.default_vision_model.trim() !== '';
    const catalog = setsTextModel || setsVisionModel ? await getCatalog() : null;
    if (typeof args.default_text_model === 'string') {
      const id = args.default_text_model.trim();
      if (!id) patch.default_text_model = null;
      else if (!catalog!.some(m => m.id === id)) return { error: `Unknown model "${id}". Call list_models for valid ids.` };
      else patch.default_text_model = id;
    }
    if (typeof args.default_vision_model === 'string') {
      const id = args.default_vision_model.trim();
      if (!id) patch.default_vision_model = null;
      else {
        const model = catalog!.find(m => m.id === id);
        if (!model) return { error: `Unknown model "${id}". Call list_models for valid ids.` };
        if (!model.vision) return { error: `"${id}" can't read images. Call list_models with vision_only.` };
        patch.default_vision_model = id;
      }
    }

    if (typeof args.tts_model === 'string') {
      if (!(TTS_MODEL_IDS as readonly string[]).includes(args.tts_model)) {
        return { error: `tts_model must be one of: ${TTS_MODEL_IDS.join(', ')}.` };
      }
      patch.tts_model = args.tts_model;
    }
    if (typeof args.default_tts_voice === 'string') {
      if (!(TTS_VOICE_IDS as readonly string[]).includes(args.default_tts_voice)) {
        return { error: `default_tts_voice must be one of: ${TTS_VOICE_IDS.join(', ')}.` };
      }
      const voice = args.default_tts_voice as TtsVoice;
      const model = await effectiveTtsModel(args.tts_model);
      if (!supportsTtsVoice(model, voice)) {
        return { error: `Voice "${voice}" isn't available on ${getTtsModelName(model)}. Switch to gpt-4o-mini-tts, or pick a voice it supports.` };
      }
      patch.default_tts_voice = voice;
    }
    if (typeof args.normalize_traditional === 'boolean') patch.normalize_traditional = args.normalize_traditional;

    if (Object.keys(patch).length === 0) {
      return { error: 'Nothing to update: pass any of name, system_prompt, tts_instructions, voice_reply_mode, default_text_model, default_vision_model, tts_model, default_tts_voice, normalize_traditional.' };
    }
    const { error: updateErr } = await admin
      .from('agents')
      .update(patch)
      .eq('id', targetAgentId)
      .eq('owner_id', ownerId);
    if (updateErr) throw updateErr;
    return { ok: true, updated: Object.keys(patch) };
  };

  // Compact one-line-per-model text, not an array of keyed objects: the
  // result re-enters the prompt every turn (stateless chat resends full
  // history), so repeated JSON keys × N rows would be dead weight. Filters
  // keep it short; capped at 15. Setting a model still validates against
  // the full catalog, so a capped/filtered view never limits what's settable.
  const listModels = async (args: { provider?: string; vision_only?: boolean; free_only?: boolean }): Promise<unknown> => {
    const catalog = await getCatalog();
    const filtered = catalog
      .filter(m => !args.provider || modelProvider(m.id) === args.provider)
      .filter(m => !args.vision_only || m.vision)
      .filter(m => !args.free_only || m.isFree);
    const lines = filtered.slice(0, 15).map((m) => {
      const perM = (n: number): number => Math.round(n * 1e6 * 100) / 100;
      const tags = [m.vision ? 'vision' : '', m.isFree ? 'free' : ''].filter(Boolean).join(' ');
      return `${m.id}  $${perM(m.promptCost)}/$${perM(m.completionCost)} per Mtok${tags ? `  ${tags}` : ''}`;
    });
    return { models: lines.join('\n'), shown: lines.length, total: filtered.length };
  };

  const setCapabilities = async (args: SetCapabilitiesArgs): Promise<unknown> => {
    const desired = (args.slugs ?? []).filter(s => BUILTIN_SLUGS.includes(s));

    // Built-in catalog rows (owner_id null) → slug↔id.
    const { data: caps, error: capErr } = await admin
      .from('capabilities')
      .select('id, slug')
      .is('owner_id', null)
      .is('deleted_at', null);
    if (capErr) throw capErr;
    const idBySlug = new Map<string, string>((caps ?? []).map(c => [c.slug as string, c.id as string]));
    const desiredIds = new Set(desired.map(s => idBySlug.get(s)).filter((v): v is string => !!v));

    // Currently-attached built-in capabilities for this agent.
    const { data: attached, error: attachedErr } = await admin
      .from('agent_capabilities')
      .select('capability_id, capabilities!inner(owner_id)')
      .eq('agent_id', targetAgentId)
      .is('capabilities.owner_id', null);
    if (attachedErr) throw attachedErr;
    const currentIds = new Set((attached ?? []).map(r => r.capability_id as string));

    for (const id of desiredIds) {
      if (!currentIds.has(id)) {
        const { error: aErr } = await admin.rpc('attach_capability', {
          p_agent_id: targetAgentId, p_owner_id: ownerId, p_capability_id: id,
        });
        if (aErr) throw aErr;
      }
    }
    for (const id of currentIds) {
      if (!desiredIds.has(id)) {
        const { error: dErr } = await admin.rpc('detach_capability', {
          p_agent_id: targetAgentId, p_owner_id: ownerId, p_capability_id: id,
        });
        if (dErr) throw dErr;
      }
    }
    return { ok: true, enabled: desired };
  };

  // ctx is the end-user run context the shared loop passes; the builder
  // tools operate on the bound target agent and ignore it.
  const execute = async (name: string, argumentsJson: string): Promise<string> => {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argumentsJson) as Record<string, unknown>;
    } catch {
      return JSON.stringify({ error: 'Tool arguments were not valid JSON.' });
    }
    try {
      if (name === 'update_agent')     return JSON.stringify(await updateAgent(args));
      if (name === 'set_capabilities') return JSON.stringify(await setCapabilities(args));
      if (name === 'list_models')      return JSON.stringify(await listModels(args));
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    } catch (err) {
      return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
    }
  };

  return { schemas, execute };
};

export const agentTarget: FermionTarget = {
  mutatingTools: ['update_agent', 'set_capabilities'],
  resolve: async (admin, id) => {
    const agent = await findAgentById(admin, id);
    if (!agent) return null;
    // Inject the agent's current config so fermion edits in place (revise
    // the existing prompt, keep capabilities it isn't changing) rather
    // than starting blind on every turn.
    const capabilities = await loadActiveCapabilities(admin, agent.id);
    const text = resolveTextModel(agent.defaultTextModel);
    return {
      ownerId: agent.ownerId,
      systemPrompt: builderSystemPrompt({
        name:                 agent.name,
        systemPrompt:         agent.systemPrompt,
        capabilitySlugs:      capabilities.map(c => c.slug),
        ttsInstructions:      agent.ttsInstructions,
        voiceReplyMode:       agent.voiceReplyMode,
        textModel:            text.id,
        textModelIsDefault:   text.isDefault,
        visionModel:          agent.defaultVisionModel,
        ttsModel:             agent.defaultTtsModel,
        ttsVoice:             agent.defaultTtsVoice,
        normalizeTraditional: agent.normalizeTraditional,
        hasAvatar:            !!agent.avatarUrl,
      }),
      toolset: buildBuilderToolset(admin, agent.ownerId, agent.id),
    };
  },
};
