import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'message-audio';

const extFromMime = (mime: string): string => {
  switch (mime) {
    case 'audio/aac': return 'aac';
    case 'audio/m4a': return 'm4a';
    default: throw new Error(`Unsupported audio mime: ${mime}`);
  }
};

// Path layout in `message-audio`:
//   <owner>/<thread>/in/<lineMessageId>.<ext>  — user-uploaded voice
//   <owner>/<thread>/out/<runId>.<ext>         — fermi-generated (TTS)
// `in/` + `out/` describe direction of flow (user → fermi vs
// fermi → user). Matches `message-images` for cross-bucket symmetry;
// future modalities slot into the same in/out taxonomy.

// Uploads TTS-generated audio. `upsert: true` keeps the operation
// idempotent — pgmq re-delivery of the same agent run re-uses the
// same path without erroring.
export const uploadGeneratedAudio = async (
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
  const storagePath = `${ownerId}/${threadId}/out/${runId}.${extFromMime(mime)}`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (uploadErr) throw uploadErr;
  return { storagePath };
};

// Uploads user-sent audio (LINE voice message bytes after Whisper has
// extracted the transcript). Retained for future thread replay UIs —
// no consumer reads this today, but the per-thread path layout lets a
// future retention cron prefix-delete without a follow-up migration.
export const uploadUserAudio = async (
  admin: SupabaseClient,
  params: {
    ownerId: string;
    threadId: string;
    lineMessageId: string;
    mime: string;
    bytes: Uint8Array;
  },
): Promise<{ storagePath: string }> => {
  const { ownerId, threadId, lineMessageId, mime, bytes } = params;
  const storagePath = `${ownerId}/${threadId}/in/${lineMessageId}.${extFromMime(mime)}`;
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
