import type { Tool } from './index.ts';

// Cap a single memory so one save can't dominate the recall budget or bloat a
// row. Long-form notes belong in the knowledge base, not user-model memory.
const MAX_MEMORY_CHARS = 500;

// Bound stored memories per subject. Recall only reads the newest few, so rows
// past this ceiling are dead weight and an abuse vector (an end-user coaxing
// the agent into saving endless distinct facts to bloat storage / persist
// injection payloads). Generously above MEMORY_INJECT_LIMIT so genuine
// long-lived context outlives any single turn's recall window.
const MAX_MEMORIES_PER_SUBJECT = 100;

interface SaveArgs {
  content?: unknown;
}

export const saveMemory: Tool = {
  name: 'save_memory',
  capabilitySlug: 'memory',
  description:
    'Save a durable fact about the user you are talking to — a stable preference, an ongoing project, a relationship, or a recurring need — so you can recall it in future conversations. Use ONLY for things worth remembering across sessions, phrased as one concise standalone fact (e.g. "Prefers replies in Traditional Chinese", "Is building a SaaS called fermi"). Do NOT save one-off requests, transient state, or anything the user asked you to forget. If a fact is already remembered, do not save it again.',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The fact to remember, as one concise standalone sentence in the user\'s language.',
      },
    },
    required: ['content'],
    additionalProperties: false,
  },
  execute: async (rawArgs, ctx) => {
    const { content } = rawArgs as SaveArgs;
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (trimmed.length === 0) return { error: 'save_memory requires a non-empty `content` string.' };
    if (trimmed.length > MAX_MEMORY_CHARS) {
      return { error: `Memory is too long (max ${MAX_MEMORY_CHARS} characters). Save one shorter fact.` };
    }

    // Dedup exact repeats for this subject: a model re-deriving a fact it
    // already saved shouldn't grow the row set or the recall budget. Scoped
    // by the full (bot, subject) tuple — the same boundary the read uses.
    const { data: existing, error: memoryErr } = await ctx.admin
      .from('memories')
      .select('id')
      .eq('bot_id', ctx.botId)
      .eq('subject_type', ctx.subjectType)
      .eq('subject_external_id', ctx.subjectExternalId)
      .eq('content', trimmed)
      .maybeSingle();
    if (memoryErr) throw memoryErr;
    if (existing) return { ok: true, note: 'Already remembered.' };

    const { error: insertErr } = await ctx.admin
      .from('memories')
      .insert({
        bot_id:              ctx.botId,
        owner_id:            ctx.ownerId,
        subject_type:        ctx.subjectType,
        subject_external_id: ctx.subjectExternalId,
        content:             trimmed,
        source_run_id:       ctx.runId,
      });
    if (insertErr) throw insertErr;

    // Prune oldest beyond the per-subject cap. range() starting at the cap
    // returns exactly the surplus (empty until the subject exceeds the cap),
    // scoped by the same (bot, subject) tuple the read and insert use.
    const { data: surplus, error: surplusErr } = await ctx.admin
      .from('memories')
      .select('id')
      .eq('bot_id', ctx.botId)
      .eq('subject_type', ctx.subjectType)
      .eq('subject_external_id', ctx.subjectExternalId)
      .order('created_at', { ascending: false })
      .range(MAX_MEMORIES_PER_SUBJECT, MAX_MEMORIES_PER_SUBJECT + 50);
    if (surplusErr) throw surplusErr;
    if (surplus && surplus.length > 0) {
      // Deletes by id only; tenant/subject scoping is inherited from the
      // tuple-filtered select above. Keep the two together if either changes.
      const { error: pruneErr } = await ctx.admin
        .from('memories')
        .delete()
        .in('id', surplus.map((s: { id: string }) => s.id));
      if (pruneErr) throw pruneErr;
    }

    return { ok: true };
  },
};

export const listMemories: Tool = {
  name: 'list_memories',
  capabilitySlug: 'memory',
  description:
    'List the durable facts you have remembered about the user you are talking to. Use when the user asks what you remember or know about them, or to get a memory\'s id before forgetting it. Returns each memory\'s id and content.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  execute: async (_rawArgs, ctx) => {
    const { data: memories, error: memoryErr } = await ctx.admin
      .from('memories')
      .select('id, content')
      .eq('bot_id', ctx.botId)
      .eq('subject_type', ctx.subjectType)
      .eq('subject_external_id', ctx.subjectExternalId)
      .order('created_at', { ascending: false });
    if (memoryErr) throw memoryErr;
    return { memories: memories ?? [] };
  },
};

interface ForgetArgs {
  id?: unknown;
}

export const forgetMemory: Tool = {
  name: 'forget_memory',
  capabilitySlug: 'memory',
  description:
    'Permanently forget one remembered fact about this user, by id. Get the id from list_memories first. Use when the user asks you to forget something about them. Only a memory belonging to this user can be forgotten.',
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The memory id to forget, as returned by list_memories.',
      },
    },
    required: ['id'],
    additionalProperties: false,
  },
  execute: async (rawArgs, ctx) => {
    const { id } = rawArgs as ForgetArgs;
    if (typeof id !== 'string' || id.trim().length === 0) return { error: 'A memory id is required.' };

    // Scope the delete to the full (bot, subject) tuple so one end-user can
    // never forget another's memory. A 0-row result means the id doesn't
    // exist or isn't theirs. Hard delete: a forgotten memory has no lifecycle
    // worth keeping (unlike a cancelled reminder), so no soft-delete state.
    const { data: forgotten, error: forgetErr } = await ctx.admin
      .from('memories')
      .delete()
      .eq('id', id)
      .eq('bot_id', ctx.botId)
      .eq('subject_type', ctx.subjectType)
      .eq('subject_external_id', ctx.subjectExternalId)
      .select('id')
      .maybeSingle();
    if (forgetErr) throw forgetErr;
    if (!forgotten) return { error: 'No such memory for this user. It may already have been forgotten.' };
    return { ok: true, id: forgotten.id };
  },
};
