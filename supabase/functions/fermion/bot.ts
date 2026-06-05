// The bot target: fermion configuring a *bot*'s settings (which agent it
// runs, pause, group-chat gate + transcription) by talking with the
// owner instead of editing the form by hand. Mirrors the agent target:
// the toolset closes over the bound bot + owner and ignores the per-call
// ToolContext the loop passes.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolSchema, Toolset } from '../agent/tools/index.ts';
import type { FermionTarget } from './registry.ts';

interface UpdateBotArgs {
  agent_id?:                 string;
  disabled?:                 boolean;
  group_activation_code?:    string | null;
  group_transcribe_enabled?: boolean;
}

const schemas: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'update_bot',
      description:
        'Change this bot\'s settings. Pass only the fields you want to change. agent_id switches which assistant persona answers; an agent can only be connected to one bot at a time.',
      parameters: {
        type: 'object',
        properties: {
          agent_id: {
            type:        'string',
            description: 'Connect this bot to one of the owner\'s agents, by its id (see the list in your instructions). Pick by the name the user refers to.',
          },
          disabled: {
            type:        'boolean',
            description: 'true pauses the bot (it stops replying but stays connected); false resumes it.',
          },
          group_activation_code: {
            type:        ['string', 'null'],
            description: 'A 4–32 character passphrase an end-user types in a LINE group to turn the bot on there. Set it to enable group chats; pass an empty string or null to turn group chats off.',
          },
          group_transcribe_enabled: {
            type:        'boolean',
            description: 'Whether voice messages in activated groups are transcribed to text.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
];

interface CurrentBot {
  displayName:            string | null;
  agentName:             string;
  disabled:               boolean;
  groupActivationCode:    string | null;
  groupTranscribeEnabled: boolean;
}

interface OwnerAgent {
  id:   string;
  name: string;
}

const botSystemPrompt = (current: CurrentBot, agents: OwnerAgent[]): string =>
  `You are fermion, fermi's setup assistant. You help a non-technical person configure their LINE bot by talking with them.

A "bot" is a connected LINE Official Account. An "agent" is the assistant persona that answers on it. Here is this bot's current configuration:
- Name: ${current.displayName ?? '(unnamed)'}
- Connected agent: ${current.agentName}
- Status: ${current.disabled ? 'paused (not replying)' : 'active'}
- Group chats: ${current.groupActivationCode ? `on (activation passphrase: "${current.groupActivationCode}")` : 'off'}
- Transcribe group voice messages: ${current.groupTranscribeEnabled ? 'on' : 'off'}

The owner's agents you can connect (use the id with update_bot):
${agents.length ? agents.map(a => `- ${a.name} (${a.id})`).join('\n') : '- (none)'}

How to work:
- Make the change the user asks for with update_bot, passing only the fields that change.
- To switch persona, match what the user says to an agent above and pass its agent_id. Each agent connects to only one bot — if it's already connected elsewhere the change will fail and you should tell the user.
- "Pause" / "stop replying" → disabled: true. "Resume" / "turn back on" → disabled: false.
- To open the bot to LINE groups, set group_activation_code to a short passphrase (the owner picks it; end-users type it in the group). To close groups, clear it.
- After making changes, briefly tell the user what you set, in their language. Be warm and concise.

What you can't change from here, and should point elsewhere for:
- Connecting or reconnecting the LINE account, and the bot's name (that mirrors the LINE Official Account — rename it in LINE OA Manager and sync). These live on the bot's setup, not in this chat.
- The agent's own persona, voice, or capabilities — those are configured on that agent's page.`;

export const buildBotToolset = (
  admin:       SupabaseClient,
  ownerId:     string,
  targetBotId: string,
): Toolset => {
  const updateBot = async (args: UpdateBotArgs): Promise<unknown> => {
    const patch: Record<string, string | boolean | null> = {};

    if (typeof args.agent_id === 'string') {
      const { data: agent, error: agentErr } = await admin
        .from('agents')
        .select('id')
        .eq('id', args.agent_id)
        .eq('owner_id', ownerId)
        .is('deleted_at', null)
        .maybeSingle();
      if (agentErr) throw agentErr;
      if (!agent) return { error: 'That agent does not exist. Use one of the agent ids from your instructions.' };
      patch.agent_id = args.agent_id;
    }

    if (typeof args.disabled === 'boolean') {
      patch.disabled_at = args.disabled ? new Date().toISOString() : null;
    }

    if (args.group_activation_code !== undefined) {
      const raw = args.group_activation_code;
      if (raw === null || raw.trim() === '') {
        patch.group_activation_code = null;
      } else {
        const code = raw.trim();
        if (code.length < 4 || code.length > 32) {
          return { error: 'The group activation passphrase must be 4–32 characters.' };
        }
        patch.group_activation_code = code;
      }
    }

    if (typeof args.group_transcribe_enabled === 'boolean') {
      patch.group_transcribe_enabled = args.group_transcribe_enabled;
    }

    if (Object.keys(patch).length === 0) {
      return { error: 'Nothing to update: pass agent_id, disabled, group_activation_code, and/or group_transcribe_enabled.' };
    }

    const { error: updateErr } = await admin
      .from('bots')
      .update(patch)
      .eq('id', targetBotId)
      .eq('owner_id', ownerId)
      .is('deleted_at', null);
    if (updateErr) {
      // 1:1 bot↔agent binding enforced by a unique constraint on agent_id.
      if ((updateErr as { code?: string }).code === '23505') {
        return { error: 'That agent is already connected to another bot. Disconnect it there first, or pick a different agent.' };
      }
      throw updateErr;
    }
    return { ok: true, updated: Object.keys(patch) };
  };

  // ctx is the end-user run context the shared loop passes; the bot tools
  // operate on the bound bot and ignore it.
  const execute = async (name: string, argumentsJson: string): Promise<string> => {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argumentsJson) as Record<string, unknown>;
    } catch {
      return JSON.stringify({ error: 'Tool arguments were not valid JSON.' });
    }
    try {
      if (name === 'update_bot') return JSON.stringify(await updateBot(args));
      return JSON.stringify({ error: `Unknown tool: ${name}` });
    } catch (err) {
      return JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
    }
  };

  return { schemas, execute };
};

export const botTarget: FermionTarget = {
  mutatingTools: ['update_bot'],
  resolve: async (admin, id) => {
    // Unlike findBotById (active bots only), load regardless of
    // disabled_at: fermion must see — and be able to re-enable — a paused
    // bot. deleted_at is still excluded.
    const { data: bot, error: botErr } = await admin
      .from('bots')
      .select('id, owner_id, agent_id, display_name, disabled_at, group_activation_code, group_transcribe_enabled')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (botErr) throw botErr;
    if (!bot) return null;

    const { data: agents, error: agentErr } = await admin
      .from('agents')
      .select('id, name')
      .eq('owner_id', bot.owner_id)
      .is('deleted_at', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (agentErr) throw agentErr;

    const agentName = agents?.find(a => a.id === bot.agent_id)?.name ?? '(none)';

    return {
      ownerId: bot.owner_id,
      systemPrompt: botSystemPrompt(
        {
          displayName:            bot.display_name,
          agentName,
          disabled:               bot.disabled_at !== null,
          groupActivationCode:    bot.group_activation_code,
          groupTranscribeEnabled: bot.group_transcribe_enabled,
        },
        (agents ?? []).map(a => ({ id: a.id, name: a.name })),
      ),
      toolset: buildBotToolset(admin, bot.owner_id, bot.id),
    };
  },
};
