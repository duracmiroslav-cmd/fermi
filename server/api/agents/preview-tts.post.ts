// Dashboard TTS preview. Owner picks model + voice + instructions
// in the agent editor, hits ▶️, this endpoint synthesizes a short
// sample phrase from OpenAI and streams the bytes back for inline
// playback. Distinct from the worker TTS path (worker drives LINE
// replies; this drives dashboard UI), so it has its own key
// resolution + rate limit and lives in server/, not the Edge Fn.

import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { checkOwnerPreviewRateLimit } from '~~/server/utils/rate-limit';
import { loadCredential } from '~~/shared/credentials';
import { getKek } from '~~/shared/kek';
import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  TTS_MODELS,
  TTS_PREVIEW_SAMPLE_TEXT,
  TTS_VOICES,
  supportsTtsInstructions,
} from '~~/shared/tts';

const TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

const bodySchema = z.object({
  model:        z.enum(TTS_MODELS).default(DEFAULT_TTS_MODEL),
  voice:        z.enum(TTS_VOICES).default(DEFAULT_TTS_VOICE),
  instructions: z.string().max(2000).nullish(),
}).strict();

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }
  const { model, voice, instructions } = parsed.data;

  const { fermiKek, upstashUoutcome, upstashToken, openaiApiKey } = useRuntimeConfig(event);
  const admin = useSupabaseAdmin();

  const outcome = await checkOwnerPreviewRateLimit(
    admin,
    { upstashUoutcome: upstashUoutcome || null, upstashToken: upstashToken || null },
    { ownerId: user.id },
  );
  if (!outcome.allowed) {
    throw createError({
      statusCode:    429,
      statusMessage: `Preview rate limit exceeded (${outcome.blockingScope ?? 'unknown'})`,
    });
  }

  // Prefer owner BYOK OpenAI key. Fall back to platform key so an
  // owner who hasn't connected their key yet can still audition
  // voices — otherwise the dropdown is a dead UI before key setup.
  let apiKey: string | null = null;
  const kek = await getKek(fermiKek);
  try {
    const cred = await loadCredential(admin, kek, {
      userId:  user.id,
      botId:   null,
      keyType: 'openai',
    });
    apiKey = cred.plaintext;
  } catch {
    // No BYOK row — fall through to platform.
  }
  apiKey ??= openaiApiKey || null;
  if (!apiKey) {
    throw createError({
      statusCode:    503,
      statusMessage: 'TTS preview unavailable: no OpenAI key configured',
    });
  }

  const openaiBody: Record<string, unknown> = {
    model,
    input:           TTS_PREVIEW_SAMPLE_TEXT,
    voice,
    response_format: 'aac',
  };
  if (instructions && supportsTtsInstructions(model)) {
    openaiBody.instructions = instructions;
  }

  const upstream = await fetch(TTS_ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(openaiBody),
  });
  if (!upstream.ok) {
    const errBody = await upstream.text();
    throw createError({
      statusCode:    502,
      statusMessage: `OpenAI TTS ${upstream.status}: ${errBody.slice(0, 200)}`,
    });
  }

  // no-store because each preview reflects the current dropdown
  // state; a cached blob would mask a model/voice change for the
  // owner iterating to pick the right combo.
  return new Response(upstream.body, {
    headers: {
      'Content-Type':  'audio/aac',
      'Cache-Control': 'no-store',
    },
  });
});
