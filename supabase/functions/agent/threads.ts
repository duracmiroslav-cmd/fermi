import type { SupabaseClient } from '@supabase/supabase-js';
import { signMessageImageUrl } from '../../../shared/messageImages.ts';
import type { ChatMessage } from './openrouter.ts';

// Message content shapes we persist. Vision attachments store only a
// pointer (`storagePath`) into the `message-images` bucket — actual
// bytes never live in the row, so loadRecentMessages on text-heavy
// threads stays cheap even when images sit in history.
type TextContent  = { type: 'text';  text: string };
type ImageContent = { type: 'image'; mime: string; sizeBytes: number; storagePath: string };
export type MessageContent = TextContent | ImageContent;

export type MessageRole = 'user' | 'assistant' | 'tool';

// Returns the most recent active thread for the (bot, external_user)
// pair, or creates one if none exists. The `/new` command (when
// added) will open a fresh thread by inserting; this resolver always
// picks the latest by `last_message_at`.
export const resolveOrCreateLatestThread = async (
  admin: SupabaseClient,
  botId: string,
  externalUserId: string,
): Promise<string> => {
  const { data: latest, error } = await admin
    .from('threads')
    .select('id')
    .eq('bot_id', botId)
    .eq('external_user_id', externalUserId)
    .is('deleted_at', null)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (latest) return latest.id;

  const { data: created, error: insertErr } = await admin
    .from('threads')
    .insert({ bot_id: botId, external_user_id: externalUserId })
    .select('id')
    .single();
  if (insertErr) throw insertErr;
  return created.id;
};

export const appendMessage = async (
  admin: SupabaseClient,
  threadId: string,
  role: MessageRole,
  content: MessageContent,
): Promise<string> => {
  const { data, error } = await admin
    .from('messages')
    .insert({ thread_id: threadId, role, content })
    .select('id')
    .single();
  if (error) throw error;

  // Bump last_message_at so the next webhook routes to this thread
  // until `/new` (or a future timeout-based split) opens a new one.
  const { error: touchErr } = await admin
    .from('threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', threadId);
  if (touchErr) throw touchErr;

  return data.id;
};

// Newest-first DB order is reversed to chronological for the LLM
// transcript. Image entries are signed in parallel so a vision-heavy
// history doesn't serialize signing latency. Sign failures (e.g. the
// Storage object was deleted) degrade to a placeholder text so the
// surrounding turn structure stays intact for the model.
export const loadRecentMessages = async (
  admin: SupabaseClient,
  threadId: string,
  limit = 20,
): Promise<ChatMessage[]> => {
  const { data, error } = await admin
    .from('messages')
    .select('role, content')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const chronological = [...data].reverse();
  const built = await Promise.all(chronological.map(async (row): Promise<ChatMessage | null> => {
    const c = row.content as MessageContent | null;
    if (!c) return null;
    const role = row.role as ChatMessage['role'];
    if (c.type === 'text') {
      return { role, content: c.text };
    }
    if (c.type === 'image') {
      try {
        const url = await signMessageImageUrl(admin, c.storagePath);
        return { role, content: [{ type: 'image_url', image_url: { url } }] };
      } catch {
        return { role, content: '[image no longer available]' };
      }
    }
    return null;
  }));

  return built.filter((m): m is ChatMessage => m !== null);
};
