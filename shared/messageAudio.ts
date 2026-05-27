import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'message-audio';

const extFromMime = (mime: string): string => {
  switch (mime) {
    case 'audio/aac': return 'aac';
    case 'audio/m4a': return 'm4a';
    default: throw new Error(`Unsupported audio mime: ${mime}`);
  }
};

// Uploads TTS-generated audio to
// `message-audio/<ownerId>/<threadId>/<runId>.<ext>`.
// `upsert: true` keeps the operation idempotent — pgmq re-delivery
// of the same agent run re-uses the same path without erroring.
export const uploadMessageAudio = async (
  admin: SupabaseClient,
  params: {
    ownerId: string;
    threadId: string;
    runId: string;
    mime: string;
    bytes: Uint8Array;
  },
): Promise<{ storagePath: string }> => {
  const { ownerId, threadId, runId, mime, bytes } = params;
  const storagePath = `${ownerId}/${threadId}/${runId}.${extFromMime(mime)}`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (uploadErr) throw uploadErr;
  return { storagePath };
};

// LINE Reply / Push API fetches `originalContentUrl` immediately on
// delivery, so 1 hour of validity is comfortable headroom. Fresh URL
// on every call so a re-queued run doesn't reuse a stale signature.
const SIGNED_URL_TTL_SECONDS = 3600;

export const signMessageAudioUrl = async (
  admin: SupabaseClient,
  storagePath: string,
): Promise<string> => {
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
};
