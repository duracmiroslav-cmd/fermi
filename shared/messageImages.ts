import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'message-images';

const extFromMime = (mime: string): string => {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png':  return 'png';
    case 'image/gif':  return 'gif';
    case 'image/webp': return 'webp';
    default: throw new Error(`Unsupported image mime: ${mime}`);
  }
};

// Path layout in `message-images`:
//   <owner>/<thread>/<lineMessageId>.<ext>     — user-uploaded image (vision)
//   <owner>/<thread>/gen/<imageId>.<ext>       — model-generated image (image-gen)
// `gen/` subfolder separates the two so an admin viewer / cleanup
// cron can target them independently if needed.

// Uploads user-uploaded vision bytes. `upsert: true` makes the
// operation idempotent — pgmq re-delivery or a worker restart
// re-running the same image won't error.
export const uploadMessageImage = async (
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
  const storagePath = `${ownerId}/${threadId}/${lineMessageId}.${extFromMime(mime)}`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (uploadErr) throw uploadErr;
  return { storagePath };
};

// Uploads model-generated image bytes. `imageId` is a caller-chosen
// unique identifier (e.g. crypto.randomUUID()) so multiple
// generations within a single agent run don't collide.
export const uploadGeneratedImage = async (
  admin: SupabaseClient,
  params: {
    ownerId: string;
    threadId: string;
    imageId: string;
    mime: string;
    bytes: Uint8Array;
  },
): Promise<{ storagePath: string }> => {
  const { ownerId, threadId, imageId, mime, bytes } = params;
  const storagePath = `${ownerId}/${threadId}/gen/${imageId}.${extFromMime(mime)}`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (uploadErr) throw uploadErr;
  return { storagePath };
};

// LLM provider fetches the URL inline during chat completion, well
// inside 1h. Fresh URL on each call so a queued request finishing
// late doesn't hand the model a dead link.
const SIGNED_URL_TTL_SECONDS = 3600;

export const signMessageImageUrl = async (
  admin: SupabaseClient,
  storagePath: string,
): Promise<string> => {
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
};
