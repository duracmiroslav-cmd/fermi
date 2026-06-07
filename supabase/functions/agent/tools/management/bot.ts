// Bot-domain management tools: discover (list/get), edit any of the owner's
// bots by id, and summon the webhook-setup / add-and-test widgets. Every
// tool scopes by ownerId.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ManagementTool, ManagementToolContext } from './tool.ts';
import { repliedBotIds } from './state.ts';

// Confirms a bot id belongs to the owner (disabled bots included; deleted
// excluded). Returns the row or null.
const ownedBot = async (
  admin: SupabaseClient,
  ownerId: string,
  botId: unknown,
): Promise<{ id: string } | null> => {
  if (typeof botId !== 'string') return null;
  const { data, error } = await admin
    .from('bots')
    .select('id')
    .eq('id', botId)
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const listBots = async (_args: Record<string, unknown>, { admin, ownerId }: ManagementToolContext): Promise<unknown> => {
  const { data: bots, error: botErr } = await admin
    .from('bots')
    .select('id, display_name, agent_id, disabled_at, webhook_verified_at')
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (botErr) throw botErr;
  const replied = await repliedBotIds(admin, ownerId);
  return {
    bots: (bots ?? []).map(b => ({
      id:               b.id,
      name:             b.display_name ?? '(unnamed)',
      agent_id:         b.agent_id,
      status:           b.disabled_at ? 'paused' : 'active',
      webhook_verified: b.webhook_verified_at !== null,
      has_replied:      replied.has(b.id),
    })),
  };
};

const getBot = async (args: Record<string, unknown>, { admin, ownerId }: ManagementToolContext): Promise<unknown> => {
  if (typeof args.bot_id !== 'string') return { error: 'Pass bot_id (from list_bots).' };
  const { data: bot, error: botErr } = await admin
    .from('bots')
    .select('id, display_name, agent_id, disabled_at, group_activation_code, group_transcribe_enabled, platform, external_id, webhook_verified_at, avatar_url, created_at')
    .eq('id', args.bot_id)
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (botErr) throw botErr;
  if (!bot) return { error: 'No bot with that id (or it isn\'t yours).' };
  const replied = await repliedBotIds(admin, ownerId);
  return {
    id:                       bot.id,
    name:                     bot.display_name ?? '(unnamed)',
    agent_id:                 bot.agent_id,
    status:                   bot.disabled_at ? 'paused' : 'active',
    group_chats:              bot.group_activation_code ? `on (passphrase: "${bot.group_activation_code}")` : 'off',
    group_transcribe:         bot.group_transcribe_enabled,
    platform:                 bot.platform,
    external_id:              bot.external_id,
    webhook_verified:         bot.webhook_verified_at !== null,
    has_replied:              replied.has(bot.id),
    avatar:                   bot.avatar_url ? 'set' : 'not set',
  };
};

const updateBot = async (args: Record<string, unknown>, { admin, ownerId }: ManagementToolContext): Promise<unknown> => {
  const owned = await ownedBot(admin, ownerId, args.bot_id);
  if (!owned) return { error: 'No bot with that id (or it isn\'t yours). Use list_bots.' };
  const botId = owned.id;

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
    if (!agent) return { error: 'That agent does not exist (or it isn\'t yours). Use list_agents.' };
    patch.agent_id = args.agent_id;
  }

  if (typeof args.disabled === 'boolean') {
    patch.disabled_at = args.disabled ? new Date().toISOString() : null;
  }

  if (args.group_activation_code !== undefined) {
    const raw = args.group_activation_code;
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      patch.group_activation_code = null;
    } else if (typeof raw === 'string') {
      const code = raw.trim();
      if (code.length < 4 || code.length > 32) return { error: 'The group activation passphrase must be 4–32 characters.' };
      patch.group_activation_code = code;
    } else {
      return { error: 'group_activation_code must be a string or null.' };
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
    .eq('id', botId)
    .eq('owner_id', ownerId)
    .is('deleted_at', null);
  if (updateErr) {
    // 1:1 bot↔agent binding enforced by a unique constraint on agent_id.
    if ((updateErr as { code?: string }).code === '23505') {
      return { error: 'That agent is already connected to another bot. Disconnect it there first, or pick a different agent.' };
    }
    throw updateErr;
  }
  return { ok: true, bot_id: botId, updated: Object.keys(patch) };
};

// Widget directives: no server effect — the chat UI renders the action
// (webhook setup / add-and-test) against the existing secure endpoints.
// Validate ownership so the tool gets a clear error for a bad id.
const startWidget = (kind: string) =>
  async (args: Record<string, unknown>, { admin, ownerId }: ManagementToolContext): Promise<unknown> => {
    const owned = await ownedBot(admin, ownerId, args.bot_id);
    if (!owned) return { error: 'No bot with that id (or it isn\'t yours). Use list_bots.' };
    return { ok: true, widget: kind, bot_id: owned.id };
  };

export const botTools: ManagementTool[] = [
  {
    schema: {
      type: 'function',
      function: {
        name: 'list_bots',
        description: 'List the owner\'s bots (id, name, connected agent, status, whether the webhook is verified and the bot has ever replied). Use to find a bot\'s id.',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      },
    },
    run: listBots,
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'get_bot',
        description: 'Get one bot\'s full configuration (connected agent, status, group chats, webhook, etc.).',
        parameters: {
          type: 'object',
          properties: { bot_id: { type: 'string', description: 'The bot id from list_bots.' } },
          required: ['bot_id'],
          additionalProperties: false,
        },
      },
    },
    run: getBot,
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'update_bot',
        description: 'Edit a bot. Pass bot_id plus only the fields to change. agent_id switches which agent answers (an agent connects to only one bot). disabled pauses/resumes. group_activation_code (4–32 chars, or empty/null to turn off) gates group chats.',
        parameters: {
          type: 'object',
          properties: {
            bot_id:                   { type: 'string', description: 'The bot id from list_bots.' },
            agent_id:                 { type: 'string', description: 'Connect this bot to one of the owner\'s agents (list_agents).' },
            disabled:                 { type: 'boolean', description: 'true pauses (stops replying, stays connected); false resumes.' },
            group_activation_code:    { type: ['string', 'null'], description: 'A 4–32 char passphrase end-users type in a LINE group to turn the bot on there. Empty/null turns group chats off.' },
            group_transcribe_enabled: { type: 'boolean', description: 'Whether group voice messages are transcribed to text.' },
          },
          required: ['bot_id'],
          additionalProperties: false,
        },
      },
    },
    mutating: true,
    run: updateBot,
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'setup_webhook',
        description: 'Show a button that connects this bot\'s webhook to LINE and verifies it (fermi does it via the LINE API — the owner does NOT touch the LINE console). Use after a bot is connected and its webhook isn\'t verified yet.',
        parameters: {
          type: 'object',
          properties: { bot_id: { type: 'string', description: 'The bot id from list_bots.' } },
          required: ['bot_id'],
          additionalProperties: false,
        },
      },
    },
    webOnly:  true,
    linkPath: (args) => `/dashboard/bots/${String(args.bot_id ?? '')}`,
    run:      startWidget('setup_webhook'),
  },
  {
    schema: {
      type: 'function',
      function: {
        name: 'start_bot_test',
        description: 'Show an "add this bot on LINE" QR plus a one-time code. The owner adds the bot and sends it the code from their own LINE account to claim ownership; fermi detects when it binds. Once bound they can manage the bot from inside LINE. Use as the final onboarding step.',
        parameters: {
          type: 'object',
          properties: { bot_id: { type: 'string', description: 'The bot id from list_bots.' } },
          required: ['bot_id'],
          additionalProperties: false,
        },
      },
    },
    webOnly:  true,
    linkPath: (args) => `/dashboard/bots/${String(args.bot_id ?? '')}`,
    run:      startWidget('bot_test'),
  },
];
