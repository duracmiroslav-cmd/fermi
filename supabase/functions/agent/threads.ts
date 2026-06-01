import type { SupabaseClient } from '@supabase/supabase-js';
import { signMessageImageUrl } from '../../../shared/messageImages.ts';
import type { ChatMessage } from './openrouter.ts';

// Message content shapes we persist. Media attachments store only a
// pointer (`storagePath`); actual bytes never live in the row, so
// loadRecentMessages on a media-heavy thread stays cheap.
//
// Audio holds *both* transcript (what the LLM consumes on history
// rebuild) and storagePath (what a future replay viewer plays back).
// One DB row per voice turn, two consumers reading their own field.
type TextContent  = { type: 'text';  text: string };
type ImageContent = { type: 'image'; mime: string; sizeBytes: number; storagePath: string };
type AudioContent = { type: 'audio'; mime: string; sizeBytes: number; storagePath: string; transcript: string };
export type MessageContent = TextContent | ImageContent | AudioContent;

export type MessageRole = 'user' | 'assistant' | 'tool';

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

  // last_message_at drives which thread the next webhook routes to.
  const { error: touchErr } = await admin
    .from('threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', threadId);
  if (touchErr) throw touchErr;

  return data.id;
};

// Image entries are signed in parallel so a vision-heavy history
// doesn't serialize signing latency. Sign failures (e.g. the Storage
// object was deleted) degrade to placeholder text so the surrounding
// turn structure stays intact for the model.
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
    if (c.type === 'audio') {
      // History rebuild reads the transcript only; the storagePath
      // exists for the (future) replay viewer, not the LLM.
      return { role, content: `[audio] ${c.transcript}` };
    }
    return null;
  }));

  return built.filter((m): m is ChatMessage => m !== null);
};
