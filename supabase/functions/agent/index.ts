import { createClient } from '@supabase/supabase-js';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface QueueMessage {
  msg_id: number;
  payload: unknown;
}

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
    console.log('processing webhook event', { msg_id, payload });
    // TODO M1 P0 #6: parse LINE event, call LINE Reply API to echo back.

    const { error: archiveError } = await admin.rpc('archive_webhook_event', { msg_id });
    if (archiveError) {
      console.error('archive failed', { msg_id, archiveError });
    }
  }

  return new Response(JSON.stringify({ processed: messages.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
