// Shared connect/status/disconnect lifecycle for vendor API keys
// that the user pastes in (BYOK). Tavily predates this module and
// stays inline, but every new model-provider key (OpenAI / Anthropic
// / Gemini) routes through here so the verify call is the only
// vendor-specific surface area each new provider has to add.
//
// Verify before store: spending one free request to confirm the key
// is real prevents typos from sitting encrypted in the DB and
// surfacing as opaque 401s much later when the runtime first tries
// to use them.

import type { H3Event } from 'h3';
import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { type KeyType, storeCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';

// OpenAI is the only model-provider key fermi holds directly: it backs
// TTS / STT, which OpenRouter can't route. Chat (text / vision / MCP) goes
// through OpenRouter; provider keys for chat belong in OpenRouter's own BYOK.
export type ByokKeyType = Extract<KeyType, 'openai'>;

const bodySchema = z.object({
  apiKey: z.string().trim().min(10),
});

type VerifyFn = (apiKey: string) => Promise<void>;

const throwBadKey = (vendor: string): never => {
  throw createError({
    statusCode:    401,
    statusMessage: `Invalid ${vendor} API key`,
  });
};

const throwUpstream = (vendor: string, status: number): never => {
  throw createError({
    statusCode:    400,
    statusMessage: `${vendor} verification failed (${status})`,
  });
};

const verifyOpenaiKey: VerifyFn = async (apiKey) => {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) throwBadKey('OpenAI');
  throwUpstream('OpenAI', res.status);
};

const VERIFY_BY_KEY_TYPE: Record<ByokKeyType, VerifyFn> = {
  openai: verifyOpenaiKey,
};

// Stripe-style masked preview so the UI can echo which key fermi is
// holding without re-exposing the secret. 12 chars of prefix covers
// the vendor-recognizable "sk-ant-...", "sk-...", "AIzaSy..." stems;
// 3-char suffix is just enough to disambiguate two keys side by side.
const maskApiKey = (apiKey: string): string =>
  `${apiKey.slice(0, 12)}...${apiKey.slice(-3)}`;

export const handleByokConnect = async (
  event: H3Event,
  keyType: ByokKeyType,
): Promise<{ ok: true }> => {
  const user = await getCurrentUser(event);
  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'apiKey is required' });
  }
  const { apiKey } = parsed.data;

  await VERIFY_BY_KEY_TYPE[keyType](apiKey);

  const { fermiKek } = useRuntimeConfig(event);
  const kek = await getKek(fermiKek);
  const admin = useSupabaseAdmin();

  // Idempotent connect: drop any existing row first so re-paste of a
  // rotated key replaces cleanly. The partial unique index on
  // (user_id, key_type) WHERE bot_id IS NULL would otherwise 23505.
  const { error: removeErr } = await admin
    .from('encrypted_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('key_type', keyType)
    .is('bot_id', null);
  if (removeErr) throw removeErr;

  await storeCredential(admin, kek, {
    userId:    user.id,
    botId:     null,
    keyType,
    plaintext: apiKey,
    metadata:  { masked_key: maskApiKey(apiKey) },
  });

  return { ok: true as const };
};

export interface ByokStatus {
  connected:    boolean;
  maskedKey?:   string | null;
  connectedAt?: string;
}

export const handleByokStatus = async (
  event: H3Event,
  keyType: ByokKeyType,
): Promise<ByokStatus> => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { data: cred, error: credErr } = await admin
    .from('encrypted_credentials')
    .select('created_at, metadata')
    .eq('user_id', user.id)
    .eq('key_type', keyType)
    .is('bot_id', null)
    .maybeSingle();
  if (credErr) throw credErr;

  if (!cred) return { connected: false };

  const meta = (cred.metadata ?? {}) as { masked_key?: string };
  return {
    connected:   true,
    maskedKey:   meta.masked_key ?? null,
    connectedAt: cred.created_at,
  };
};

export const handleByokDisconnect = async (
  event: H3Event,
  keyType: ByokKeyType,
): Promise<{ ok: true }> => {
  const user = await getCurrentUser(event);

  const admin = useSupabaseAdmin();
  const { error: removeErr } = await admin
    .from('encrypted_credentials')
    .delete()
    .eq('user_id', user.id)
    .eq('key_type', keyType)
    .is('bot_id', null);
  if (removeErr) throw removeErr;

  return { ok: true as const };
};
