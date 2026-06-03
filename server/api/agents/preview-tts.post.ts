// Dashboard TTS preview. Owner picks model + voice + instructions
// in the agent editor, hits ▶️, this endpoint synthesizes a short
// sample phrase from OpenAI and streams the bytes back for inline
// playback. Distinct from the worker TTS path (worker drives LINE
// replies; this drives dashboard UI), so it has its own key
// resolution + rate limit and lives in server/, not the Edge Fn.
//
// Key sourcing is platform-only, not BYOK — see backend.md
// "Dashboard try-outs vs production runtime." Cost per preview is
// ~$0.000025 (42 chars × $0.60 / 1M for gpt-4o-mini-tts), and the
// per-owner rate limit caps abuse at 1000 / day.

import { z } from 'zod';
import { getCurrentUser } from '~~/server/utils/auth';
import { checkOwnerPreviewRateLimit } from '~~/server/utils/rate-limit';
import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE,
  TTS_MODEL_IDS,
  TTS_PREVIEW_SAMPLE_TEXT,
  TTS_VOICE_IDS,
  resolveTtsInstructions,
  supportsTtsInstructions,
  supportsTtsVoice,
} from '~~/shared/tts';

const TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

// `superRefine` catches (model, voice) combos OpenAI's API rejects
// (e.g. tts-1 + cedar). The form prevents this combo through its
// model-aware dropdown; this is the defense for direct callers and
// for stale dropdown state.
const bodySchema = z.object({
  model:        z.enum(TTS_MODEL_IDS).default(DEFAULT_TTS_MODEL),
  voice:        z.enum(TTS_VOICE_IDS).default(DEFAULT_TTS_VOICE),
  instructions: z.string().max(2000).nullish(),
}).strict().superRefine((data, ctx) => {
  if (!supportsTtsVoice(data.model, data.voice)) {
    ctx.addIssue({
      code:    'custom',
      path:    ['voice'],
      message: `Voice "${data.voice}" not supported by model "${data.model}"`,
    });
  }
});

export default defineEventHandler(async (event) => {
  const user = await getCurrentUser(event);

  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message });
  }
  const { model, voice, instructions } = parsed.data;

  const { upstashUrl, upstashToken, openaiApiKey } = useRuntimeConfig(event);
  const admin = useSupabaseAdmin();

  const outcome = await checkOwnerPreviewRateLimit(
    admin,
    { upstashUrl: upstashUrl || null, upstashToken: upstashToken || null },
    { ownerId: user.id },
  );
  if (!outcome.allowed) {
    throw createError({
      statusCode:    429,
      statusMessage: `Preview rate limit exceeded (${outcome.blockingScope ?? 'unknown'})`,
    });
  }

  const apiKey = openaiApiKey || null;
  if (!apiKey) {
    throw createError({
      statusCode:    503,
      statusMessage: 'TTS preview unavailable: platform OpenAI key not configured',
    });
  }

  const openaiBody: Record<string, unknown> = {
    model,
    input:           TTS_PREVIEW_SAMPLE_TEXT,
    voice,
    response_format: 'aac',
  };
  // Same fallback as the worker: a blank box previews the default
  // accent policy, so the owner hears exactly what production sends.
  if (supportsTtsInstructions(model)) {
    openaiBody.instructions = resolveTtsInstructions(instructions);
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
