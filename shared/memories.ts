import type { SupabaseClient } from '@supabase/supabase-js';

// Most-recent memories recalled into the system prompt each turn. Bounds the
// recall token cost to a constant regardless of how many a subject accrues:
// older facts fall out of the working set rather than growing context without
// limit.
export const MEMORY_INJECT_LIMIT = 20;

export interface LoadMemoriesArgs {
  botId:             string;
  subjectType:       'user' | 'group';
  subjectExternalId: string;
  limit:             number;
}

// The subject's most recent memory contents, newest first. Scoped by the full
// (bot, subject) tuple — bot_id leads so one bot's recall can never surface
// under another sharing a LINE userId.
export const loadRecentMemories = async (
  admin: SupabaseClient,
  args: LoadMemoriesArgs,
): Promise<string[]> => {
  const { data, error } = await admin
    .from('memories')
    .select('content')
    .eq('bot_id', args.botId)
    .eq('subject_type', args.subjectType)
    .eq('subject_external_id', args.subjectExternalId)
    .order('created_at', { ascending: false })
    .limit(args.limit);
  if (error) throw error;
  return (data ?? []).map((m: { content: string }) => m.content);
};
