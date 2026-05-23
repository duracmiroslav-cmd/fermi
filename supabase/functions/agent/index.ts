import { createClient } from '@supabase/supabase-js';
import { loadCredential } from '../../../shared/credentials.ts';
import { useKek } from '../../../shared/kek.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fermiKek = Deno.env.get('FERMI_KEK')!;

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface LineEvent {
  type: string;
  replyToken?: string;
  message?: {
    type: string;
    text?: string;
  };
}

interface QueuePayload {
  channelId: string;
  destination?: string;
  events?: LineEvent[];
}

interface QueueMessage {
  msg_id: number;
  payload: QueuePayload;
}

class LineReplyError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const lookupChannelOwner = async (channelId: string): Promise<string | null> => {
  const { data, error } = await admin
    .from('channels')
    .select('owner_id')
    .eq('id', channelId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data?.owner_id ?? null;
};

const replyText = async (
  accessToken: string,
  replyToken: string,
  text: string,
): Promise<void> => {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new LineReplyError(res.status, `LINE Reply API ${res.status}: ${body}`);
  }
};

const processMessage = async (payload: QueuePayload): Promise<void> => {
  const events = payload.events ?? [];
  if (events.length === 0) return;

  const ownerId = await lookupChannelOwner(payload.channelId);
  if (!ownerId) {
    // Channel was disconnected while message sat in the queue. Skip
    // and let the caller archive so we don't loop forever.
    console.warn('channel deleted; dropping message', { channelId: payload.channelId });
    return;
  }

  const kek = await useKek(fermiKek);
  const { plaintext: accessToken } = await loadCredential(admin, kek, {
    userId: ownerId,
    channelId: payload.channelId,
    keyType: 'line_channel_access_token',
  });

  for (const event of events) {
    if (event.type === 'message' && event.message?.type === 'text' && event.replyToken) {
      try {
        await replyText(accessToken, event.replyToken, event.message.text ?? '');
      } catch (err) {
        // 400 from Reply API is terminal (expired or already-used
        // replyToken); retrying will just 400 again forever. Drop it.
        if (err instanceof LineReplyError && err.status === 400) {
          console.warn('reply token expired; dropping event', { channelId: payload.channelId });
          continue;
        }
        throw err;
      }
    }
  }
};

Deno.serve(async () => {
  const { data, error } = await admin.rpc('dequeue_webhook_events', {
    batch_size: 10,
    visibility_timeout: 30,
  });

  if (error) {
    console.error('dequeue failed', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messages = (data ?? []) as QueueMessage[];

  for (const { msg_id, payload } of messages) {
    try {
      await processMessage(payload);
      const { error: archiveError } = await admin.rpc('archive_webhook_event', { msg_id });
      if (archiveError) {
        console.error('archive failed', { msg_id, archiveError });
      }
    } catch (err) {
      console.error('process failed; leaving for retry', { msg_id, err });
    }
  }

  return new Response(JSON.stringify({ processed: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
