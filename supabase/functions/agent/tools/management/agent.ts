// Agent-domain management tools: discover (list/get) and edit any of the
// owner's agents by id. Every tool scopes by ownerId.

import type { SupabaseClient } from '@supabase/supabase-js';
import { BUILT_IN_CAPABILITIES } from '../../../../../shared/capabilities.ts';
import { VOICE_REPLY_MODES, findAgentById } from '../../../../../shared/agents.ts';
import { loadActiveCapabilities } from '../../../../../shared/agentCapabilities.ts';
import { DEFAULT_VISION_MODEL, resolveTextModel } from '../../../../../shared/constants/models.ts';
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
} from '../../../../../shared/tts.ts';
import {
  MODEL_PROVIDERS,
  OPENROUTER_MODELS_URL,
  type CatalogModel,
  type RawOpenRouterModel,
  filterOpenRouterModels,
  modelProvider,
} from '../../../../../shared/openrouterModels.ts';
import type { ManagementTool, ManagementToolContext } from './tool.ts';

const BUILTIN_SLUGS = Object.keys(BUILT_IN_CAPABILITIES);

// Lists the capabilities fermion may enable, flagging ones that need a
// credential connected first. Reused by the system prompt.
export const capabilityCatalog = (): string =>
  BUILTIN_SLUGS.map((slug) => {
    const c = BUILT_IN_CAPABILITIES[slug];
    const needsKey = c.credentialType === 'providers' ? ' (needs a credential connected first)' : '';
    return `- ${slug}: ${c.description}${needsKey}`;
  }).join('\n');

// Voices grouped by perceived gender, so fermion recommends one without
// any audio sample. Reused by the system prompt.
export const voiceCatalog = (): string => {
  const byGender = (g: VoiceGender): string =>
    TTS_VOICE_IDS.filter(v => TTS_VOICE_GENDERS[v] === g).join(', ') || '(none)';
  return `Female: ${byGender('female')}\nMale: ${byGender('male')}\nNeutral: ${byGender('neutral')}`;
};

// 5-min model catalog cache, per isolate; fetched lazily.
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

// Confirms an agent id belongs to the owner before any edit; returns the
// row or null (caller turns null into a clear "not yours" error).
const ownedAgent = async (
  admin: SupabaseClient,
  ownerId: string,
  agentId: unknown,
): Promise<{ id: string } | null> => {
  if (typeof agentId !== 'string') return null;
  const { data, error } = await admin
    .from('agents')
    .select('id')
    .eq('id', agentId)
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const effectiveTtsModel = async (
  admin: SupabaseClient,
  ownerId: string,
  agentId: string,
  pending?: string,
): Promise<TtsModel> => {
  if (pending && (TTS_MODEL_IDS as readonly string[]).includes(pending)) return pending as TtsModel;
  const { data: agent, error: agentErr } = await admin
    .from('agents')
    .select('default_tts_model')
    .eq('id', agentId)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (agentErr) throw agentErr;
  return parseTtsModel(agent?.default_tts_model ?? null) ?? DEFAULT_TTS_MODEL;
};

const listAgents = async (_args: Record<string, unknown>, { admin, ownerId }: ManagementToolContext): Promise<unknown> => {
  const { data: agents, error: agentErr } = await admin
    .from('agents')
    .select('id, name, is_default')
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (agentErr) throw agentErr;
  return {
    agents: (agents ?? []).map(a => ({ id: a.id, name: a.name, default: a.is_default })),
  };
};

const getAgent = async (args: Record<string, unknown>, { admin, ownerId }: ManagementToolContext): Promise<unknown> => {
  if (typeof args.agent_id !== 'string') return { error: 'Pass agent_id (from list_agents).' };
  const agent = await findAgentById(admin, args.agent_id);
  if (!agent || agent.ownerId !== ownerId) return { error: 'No agent with that id (or it isn\'t yours).' };
  const capabilities = await loadActiveCapabilities(admin, agent.id);
  const text = resolveTextModel(agent.defaultTextModel);
  return {
    id:                    agent.id,
    name:                  agent.name,
    system_prompt:         agent.systemPrompt,
    capabilities:          capabilities.map(c => c.slug),
    voice_reply_mode:      agent.voiceReplyMode,
    tts_instructions:      agent.ttsInstructions,
    text_model:            text.isDefault ? `${text.id} (platform default)` : text.id,
    vision_model:          agent.defaultVisionModel ?? `${DEFAULT_VISION_MODEL} (platform default)`,
    tts_model:             agent.defaultTtsModel ? getTtsModelName(agent.defaultTtsModel) : `${getTtsModelName(DEFAULT_TTS_MODEL)} (platform default)`,
    tts_voice:             agent.defaultTtsVoice ? `${getTtsVoiceName(agent.defaultTtsVoice)} (${TTS_VOICE_GENDERS[agent.defaultTtsVoice]})` : '(platform default)',
    normalize_traditional: agent.normalizeTraditional,
    avatar:                agent.avatarUrl ? 'set' : 'not set',
  };
};

const updateAgent = async (args: Record<string, unknown>, { admin, ownerId }: ManagementToolContext): Promise<unknown> => {
  const owned = await ownedAgent(admin, ownerId, args.agent_id);
  if (!owned) return { error: 'No agent with that id (or it isn\'t yours). Use list_agents.' };
  const agentId = owned.id;

  const patch: Record<string, string | boolean | null> = {};
  if (typeof args.name === 'string' && args.name.trim()) patch.name = args.name.trim().slice(0, 60);
  if (typeof args.system_prompt === 'string') patch.system_prompt = args.system_prompt;
  if (typeof args.tts_instructions === 'string') patch.tts_instructions = args.tts_instructions.trim().slice(0, 2000) || null;
  if (typeof args.voice_reply_mode === 'string') {
    if (!(VOICE_REPLY_MODES as readonly string[]).includes(args.voice_reply_mode)) {
      return { error: `voice_reply_mode must be one of: ${VOICE_REPLY_MODES.join(', ')}.` };
    }
    patch.voice_reply_mode = args.voice_reply_mode;
  }

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
    const model = await effectiveTtsModel(admin, ownerId, agentId, typeof args.tts_model === 'string' ? args.tts_model : undefined);
    if (!supportsTtsVoice(model, voice)) {
      return { error: `Voice "${voice}" isn't available on ${getTtsModelName(model)}. Switch to gpt-4o-mini-tts, or pick a voice it supports.` };
    }
    patch.default_tts_voice = voice;
  }
  if (typeof args.normalize_traditional === 'boolean') patch.normalize_traditional = args.normalize_traditional;

  if (Object.keys(patch).length === 0) {
    return { error: 'Nothing to update beyond agent_id.' };
  }
  const { error: updateErr } = await admin
    .from('agents')
    .update(patch)
    .eq('id', agentId)
    .eq('owner_id', ownerId);
  if (updateErr) throw updateErr;
  return { ok: true, agent_id: agentId, updated: Object.keys(patch) };
};

const setCapabilities = async (args: Record<string, unknown>, { admin, ownerId }: ManagementToolContext): Promise<unknown> => {
  const owned = await ownedAgent(admin, ownerId, args.agent_id);
  if (!owned) return { error: 'No agent with that id (or it isn\'t yours). Use list_agents.' };
  const agentId = owned.id;
  const desired = (Array.isArray(args.slugs) ? args.slugs : []).filter(
    (s): s is string => typeof s === 'string' && BUILTIN_SLUGS.includes(s),
  );

  const { data: caps, error: capErr } = await admin
    .from('capabilities')
    .select('id, slug')
    .is('owner_id', null)
    .is('deleted_at', null);
  if (capErr) throw capErr;
  const idBySlug = new Map<string, string>((caps ?? []).map(c => [c.slug as string, c.id as string]));
  const desiredIds = new Set(desired.map(s => idBySlug.get(s)).filter((v): v is string => !!v));

  const { data: attached, error: attachedErr } = await admin
    .from('agent_capabilities')
    .select('capability_id, capabilities!inner(owner_id)')
    .eq('agent_id', agentId)
    .is('capabilities.owner_id', null);
  if (attachedErr) throw attachedErr;
  const currentIds = new Set((attached ?? []).map(r => r.capability_id as string));

  for (const id of desiredIds) {
    if (!currentIds.has(id)) {
      const { error: aErr } = await admin.rpc('attach_capability', {
        p_agent_id: agentId, p_owner_id: ownerId, p_capability_id: id,
      });
      if (aErr) throw aErr;
    }
  }
  for (const id of currentIds) {
    if (!desiredIds.has(id)) {
      const { error: dErr } = await admin.rpc('detach_capability', {
        p_agent_id: agentId, p_owner_id: ownerId, p_capability_id: id,
      });
      if (dErr) throw dErr;
    }
  }
  return { ok: true, agent_id: agentId, enabled: desired };
};

const listModels = async (args: Record<string, unknown>, _ctx: ManagementToolContext): Promise<unknown> => {
  const provider = typeof args.provider === 'string' ? args.provider : undefined;
  const visionOnly = args.vision_only === true;
  const freeOnly = args.free_only === true;
  const catalog = await getCatalog();
  const filtered = catalog
    .filter(m => !provider || modelProvider(m.id) === provider)
    .filter(m => !visionOnly || m.vision)
    .filter(m => !freeOnly || m.isFree);
  const lines = filtered.slice(0, 15).map((m) => {
    const perM = (n: number): number => Math.round(n * 1e6 * 100) / 100;
    const tags = [m.vision ? 'vision' : '', m.isFree ? 'free' : ''].filter(Boolean).join(' ');
    return `${m.id}  $${perM(m.promptCost)}/$${perM(m.completionCost)} per Mtok${tags ? `  ${tags}` : ''}`;
  });
  return { models: lines.join('\n'), shown: lines.length, total: filtered.length };
};

export const agentTools: ManagementTool[] = [
  {
    schema: {
      type: 'function',
      function: {
        name: 'list_agents',
        description: 'List the owner\'s agents (id, name, whether it\'s the default). Use to find an agent\'s id before getting or editing it.',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      },
    },
    run: listAgents,
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'get_agent',
        description: 'Get one agent\'s full configuration (persona, capabilities, voice, models, language). Call before editing so you change in place rather than from scratch.',
        parameters: {
          type: 'object',
          properties: { agent_id: { type: 'string', description: 'The agent id from list_agents.' } },
          required: ['agent_id'],
          additionalProperties: false,
        },
      },
    },
    run: getAgent,
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'update_agent',
        description: 'Edit an agent. Pass agent_id plus only the fields to change. Write system_prompt as clear prose in the user\'s language, addressed to the agent ("You are…"). For models call list_models first; for the voice pick by gender from the catalog in your instructions.',
        parameters: {
          type: 'object',
          properties: {
            agent_id:          { type: 'string', description: 'The agent id from list_agents.' },
            name:              { type: 'string', description: 'Short display name, e.g. "Cafe Host".' },
            system_prompt:     { type: 'string', description: 'The full persona + behavior instructions.' },
            tts_instructions:  { type: 'string', description: 'How the spoken voice should sound (tone, pace, persona), in the user\'s words. No language/accent — handled automatically. Empty string clears it.' },
            voice_reply_mode:  { type: 'string', enum: [...VOICE_REPLY_MODES], description: '"off" = text only, "auto" = voice only when the user sent voice, "always" = always voice.' },
            default_text_model:   { type: 'string', description: 'OpenRouter model id for text. list_models for ids. Empty string resets to platform default.' },
            default_vision_model: { type: 'string', description: 'OpenRouter model id for image messages; must be vision-capable. Empty string resets to default.' },
            tts_model:         { type: 'string', enum: [...TTS_MODEL_IDS], description: 'Speech model. gpt-4o-mini-tts is cheapest + honors tts_instructions; tts-1 ignores them and supports fewer voices.' },
            default_tts_voice: { type: 'string', enum: [...TTS_VOICE_IDS], description: 'The voice. Pick by gender from the catalog in your instructions. tts-1/hd support only a subset.' },
            normalize_traditional: { type: 'boolean', description: 'Convert the assistant\'s Chinese replies to Traditional Chinese (Taiwan).' },
          },
          required: ['agent_id'],
          additionalProperties: false,
        },
      },
    },
    mutating: true,
    run: updateAgent,
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'set_capabilities',
        description: `Set which built-in capabilities an agent can use. Pass agent_id and the COMPLETE desired set of slugs (anything omitted is turned off). Some need a credential connected on the Connectors page first. Slugs: ${BUILTIN_SLUGS.join(', ')}.`,
        parameters: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'The agent id from list_agents.' },
            slugs:    { type: 'array', items: { type: 'string', enum: BUILTIN_SLUGS }, description: 'Complete desired set.' },
          },
          required: ['agent_id', 'slugs'],
          additionalProperties: false,
        },
      },
    },
    mutating: true,
    run: setCapabilities,
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'list_models',
        description: 'List available AI models (id, price per million tokens, free / vision flags). Narrow with a filter so the list stays short — by provider, vision-capable only, or free only.',
        parameters: {
          type: 'object',
          properties: {
            provider:    { type: 'string', enum: [...MODEL_PROVIDERS], description: 'Only models from this provider.' },
            vision_only: { type: 'boolean', description: 'Only models that can read images.' },
            free_only:   { type: 'boolean', description: 'Only models that cost nothing.' },
          },
          required: [],
          additionalProperties: false,
        },
      },
    },
    run: listModels,
  },
];
