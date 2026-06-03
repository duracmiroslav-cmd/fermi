import type { Tool } from './index.ts';

// The LLM resolves natural-language times ("tomorrow 9am") into an
// absolute fire_at using the current time + timezone injected into the
// system prompt; these tools never parse relative time themselves.
//
// There's no per-tier cap on how many reminders a user can hold: an
// unfired reminder costs ~one row, and the two real cost axes are
// already bounded elsewhere — creation velocity by the per-(bot,user)
// rate limiter, and delivery by the owner's monthly `line_push` quota.

interface CreateArgs {
  fire_at?: string;
  message?: string;
}

interface CancelArgs {
  id?: string;
}

export const createReminder: Tool = {
  name: 'create_reminder',
  capabilitySlug: 'reminders',
  description:
    'Schedule a one-shot reminder pushed to this user at a future time. Use the current time and timezone from the system context to resolve relative times. Recurring reminders are not supported — schedule a single future moment only.',
  parameters: {
    type: 'object',
    properties: {
      fire_at: {
        type: 'string',
        description:
          'When to fire, as an ISO 8601 timestamp with timezone offset, e.g. "2026-06-03T09:00:00+08:00". Must be in the future.',
      },
      message: {
        type: 'string',
        description: 'The reminder text to send to the user when it fires.',
      },
    },
    required: ['fire_at', 'message'],
    additionalProperties: false,
  },
  execute: async (rawArgs, ctx) => {
    const { fire_at, message } = rawArgs as CreateArgs;
    if (!fire_at || !message) {
      return { error: 'Both fire_at and message are required.' };
    }
    const fireAt = new Date(fire_at);
    if (Number.isNaN(fireAt.getTime())) {
      return { error: `Could not parse fire_at "${fire_at}". Use ISO 8601 with a timezone offset.` };
    }
    if (fireAt.getTime() <= Date.now()) {
      return { error: 'fire_at is in the past. Pick a future time.' };
    }

    const { data: created, error: insertErr } = await ctx.admin
      .from('reminders')
      .insert({
        owner_id:         ctx.ownerId,
        bot_id:           ctx.botId,
        thread_id:        ctx.threadId,
        external_user_id: ctx.externalUserId,
        fire_at:          fireAt.toISOString(),
        message,
      })
      .select('id, fire_at')
      .single();
    if (insertErr) throw insertErr;

    return {
      ok: true,
      id: created.id,
      fire_at: created.fire_at,
      message,
    };
  },
};

export const listReminders: Tool = {
  name: 'list_reminders',
  capabilitySlug: 'reminders',
  description:
    'List this user\'s pending (not-yet-fired) reminders, earliest first. Returns each reminder\'s id, fire time, and message.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async (_rawArgs, ctx) => {
    const { data: reminders, error: reminderErr } = await ctx.admin
      .from('reminders')
      .select('id, fire_at, message')
      .eq('owner_id', ctx.ownerId)
      .eq('external_user_id', ctx.externalUserId)
      .eq('status', 'pending')
      .order('fire_at', { ascending: true });
    if (reminderErr) throw reminderErr;
    return { reminders: reminders ?? [] };
  },
};

export const cancelReminder: Tool = {
  name: 'cancel_reminder',
  capabilitySlug: 'reminders',
  description:
    'Cancel one of this user\'s pending reminders by id. Get the id from list_reminders first. Only pending reminders belonging to this user can be cancelled.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The reminder id to cancel, as returned by list_reminders.',
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
  execute: async (rawArgs, ctx) => {
    const { id } = rawArgs as CancelArgs;
    if (!id) return { error: 'A reminder id is required.' };

    // Scope the update to (owner, end-user) so one end-user of a shared
    // bot can never cancel another's reminder. A 0-row result means the
    // id doesn't exist, isn't theirs, or already fired/cancelled.
    const { data: cancelled, error: cancelErr } = await ctx.admin
      .from('reminders')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('owner_id', ctx.ownerId)
      .eq('external_user_id', ctx.externalUserId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (cancelErr) throw cancelErr;
    if (!cancelled) {
      return { error: 'No pending reminder with that id for this user. It may have already fired or been cancelled.' };
    }
    return { ok: true, id: cancelled.id };
  },
};
