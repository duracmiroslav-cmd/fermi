import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'message-images';

// Fresh signed URL minted per call so a late-finishing queued request
// never hands the model a dead link; 1h covers the provider's inline
// fetch during chat completion.
const SIGNED_URL_TTL_SECONDS = 3600;

const extFromMime = (mime: string): string => {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/gif': return 'gif';
    case 'image/webp': return 'webp';
    default: throw new Error(`Unsupported image mime: ${mime}`);
  }
};

// Path layout in `message-images`:
//   <owner>/<thread>/in/<lineMessageId>.<ext>   (user-uploaded vision)
//   <owner>/<thread>/out/<imageId>.<ext>        (fermi-generated, image-gen)
// `in/` + `out/` describe direction of flow (user → fermi vs
// fermi → user). Matches `message-audio` for cross-bucket symmetry;
// future modalities slot into the same in/out taxonomy.

// Uploads user-uploaded vision bytes. `lineMessageId` is the LINE
// webhook event ID. Using a real entity ID as the storage key means
// the path doubles as an audit handle back to the source event, and
// pgmq re-delivery of the same message upserts to the same path
// (idempotent).
export const uploadUserImage = async (
  admin: SupabaseClient,
  params: {
    ownerId:       string;
    threadId:      string;
    lineMessageId: string;
    mime:          string;
    bytes:         Uint8Array;
  },
): Promise<{ storagePath: string }> => {
  const { ownerId, threadId, lineMessageId, mime, bytes } = params;
  const storagePath = `${ownerId}/${threadId}/in/${lineMessageId}.${extFromMime(mime)}`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert:      true,
  });
  if (uploadErr) throw uploadErr;
  return { storagePath };
};

// Uploads fermi-generated image bytes. `imageId` is typically the
// LLM-issued `tool_call_id`. Using a real entity ID as the storage
// key means the path doubles as an audit handle back to the
// `agent_run_steps` row that recorded the tool call, and a retry of
// the same call upserts to the same path (idempotent).
export const uploadGeneratedImage = async (
  admin: SupabaseClient,
  params: {
    ownerId:  string;
    threadId: string;
    imageId:  string;
    mime:     string;
    bytes:    Uint8Array;
  },
): Promise<{ storagePath: string }> => {
  const { ownerId, threadId, imageId, mime, bytes } = params;
  const storagePath = `${ownerId}/${threadId}/out/${imageId}.${extFromMime(mime)}`;
  const { error: uploadErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: mime,
    upsert:      true,
  });
  if (uploadErr) throw uploadErr;
  return { storagePath };
};

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
