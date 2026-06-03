// The builder agent: a fermi-owned assistant whose tools edit the
// *target* agent's config instead of doing end-user work. It reuses the
// same runAgentConversation loop; its toolset closes over the target
// agent + owner and ignores the per-call ToolContext the loop passes
// (which carries end-user-run plumbing the builder doesn't need).

import type { SupabaseClient } from '@supabase/supabase-js';
import { BUILT_IN_CAPABILITIES } from '../../../shared/capabilities.ts';
import { VOICE_REPLY_MODES } from '../../../shared/agents.ts';
import type { ToolSchema, Toolset } from '../agent/tools/index.ts';

const BUILTIN_SLUGS = Object.keys(BUILT_IN_CAPABILITIES);

interface UpdateAgentArgs {
  name?:             string;
  system_prompt?:    string;
  tts_instructions?: string;
  voice_reply_mode?: string;
}

interface SetCapabilitiesArgs {
  slugs?: string[];
}

const schemas: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'update_agent',
      description:
        'Set the agent\'s name, system prompt, and/or voice settings. Write the system prompt as clear prose in the user\'s language, addressed to the agent ("You are…"). Pass only the fields you want to change.',
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
];

// Lists the capabilities the builder may enable, so it suggests real
// slugs and flags the ones that need a credential connected first.
export const capabilityCatalog = (): string =>
  BUILTIN_SLUGS.map((slug) => {
    const c = BUILT_IN_CAPABILITIES[slug];
    const needsKey = c.credentialType === 'providers' ? ' (needs a credential connected first)' : '';
    return `- ${slug}: ${c.description}${needsKey}`;
  }).join('\n');

export interface CurrentAgent {
  name:            string;
  systemPrompt:    string | null;
  capabilitySlugs: string[];
  ttsInstructions: string | null;
  voiceReplyMode:  string;
}

export const builderSystemPrompt = (current: CurrentAgent): string =>
  `You are fermion, fermi's setup assistant. You help a non-technical person configure their LINE assistant by talking with them; they should never have to write a "system prompt" themselves.

This is the agent's current configuration. Build on it: only change what the user asks for, and keep the rest. If the system prompt is empty, you're setting it up from scratch.
- Name: ${current.name}
- System prompt: ${current.systemPrompt && current.systemPrompt.trim() ? current.systemPrompt : '(none yet)'}
- Enabled capabilities: ${current.capabilitySlugs.length ? current.capabilitySlugs.join(', ') : '(none)'}
- Voice reply mode: ${current.voiceReplyMode}
- Voice tone instructions: ${current.ttsInstructions && current.ttsInstructions.trim() ? current.ttsInstructions : '(none)'}

How to work:
- If the prompt is empty, open by asking what their business is or what they want the assistant to do. Ask 2-4 short questions before drafting; don't interrogate. If they're refining an existing setup, just make the change they asked for.
- Call update_agent to set a fitting name and a clear, concise system prompt (written in the user's language, addressed to the agent as "You are…"). Keep it practical: who it is, who it serves, tone, what to do, what to avoid. When revising, start from the current prompt above rather than rewriting from nothing.
- If the user wants the assistant to speak, or describes how it should sound, use update_agent: set voice_reply_mode (off / auto / always) and/or tts_instructions (the speaking tone, in their words). Don't put language or accent in tts_instructions — that's handled automatically. The specific voice is chosen by listening to samples on the form, so for "which voice" point them there rather than guessing one.
- If a capability would clearly help, call set_capabilities with the full desired set (it replaces the current set, so include the ones to keep). Mention when one needs a credential connected on the Connectors page.
- After making changes, briefly tell the user what you set and invite them to test it on the right, then refine.
- Reply in the user's language. Be warm and concise. Don't expose internal jargon like "system prompt" unless they use it first.

What you can and can't change:
- You can set: the name, the persona, which capabilities are on, whether it replies with voice (voice_reply_mode), and how the voice sounds (tts_instructions).
- You cannot change these from here — they live on the setup form beside this chat. If the user asks, point them to the form and do not claim to have changed them: the specific voice, the AI models (text / vision / speech), and the avatar.

Available capabilities:
${capabilityCatalog()}`;

export const buildBuilderToolset = (
  admin:         SupabaseClient,
  ownerId:       string,
  targetAgentId: string,
): Toolset => {
  const updateAgent = async (args: UpdateAgentArgs): Promise<unknown> => {
    const patch: Record<string, string | null> = {};
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
    if (Object.keys(patch).length === 0) {
      return { error: 'Nothing to update: pass name, system_prompt, tts_instructions, and/or voice_reply_mode.' };
    }
    const { error: updateErr } = await admin
      .from('agents')
      .update(patch)
      .eq('id', targetAgentId)
      .eq('owner_id', ownerId);
    if (updateErr) throw updateErr;
    return { ok: true, updated: Object.keys(patch) };
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
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    } catch (err) {
      return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
    }
  };

  return { schemas, execute };
};
