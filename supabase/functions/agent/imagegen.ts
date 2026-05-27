// fal.ai image generation client. Direct fetch wrapper for the
// synchronous `https://fal.run/{model}` endpoint — fal also exposes
// a queue API for long-running jobs but nano-banana finishes in
// well under the worker's 400s wall clock, so we keep it sync and
// skip the polling complexity.

export class ImageGenError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export const DEFAULT_IMAGE_MODEL = 'fal-ai/nano-banana';

// Maps the LLM-facing size enum to fal's image_size string. Square
// is the cheapest / most common; portrait + landscape cover the two
// common aspect-ratio asks ("phone wallpaper", "banner").
export type ImageSize = 'square' | 'portrait' | 'landscape';
const sizeMap: Record<ImageSize, string> = {
  square: 'square_hd',
  portrait: 'portrait_16_9',
  landscape: 'landscape_16_9',
};

// Watermark suffix appended to every prompt. Prompt-based watermarks
// are unreliable (model may ignore, may draw something other than
// the exact text), so this is a best-effort MVP — a server-side
// composite is a follow-up if launch UX demands a guarantee.
const WATERMARK_SUFFIX = ", with small 'fermi' text watermark in bottom-right corner";

export interface GeneratedImage {
  // Raw bytes downloaded from fal's hosted result URL. Worker uploads
  // these to Supabase Storage before delivering to LINE so we control
  // retention (fal's hosted URL expires).
  bytes: Uint8Array;
  mime: string;
  // Hint from fal — width/height of the generated image. Not always
  // returned; null when missing.
  width: number | null;
  height: number | null;
}

interface FalResponse {
  images?: Array<{
    url: string;
    width?: number;
    height?: number;
    content_type?: string;
  }>;
}

export const generateImage = async (params: {
  apiKey: string;
  model: string;
  prompt: string;
  size: ImageSize;
}): Promise<GeneratedImage> => {
  const { apiKey, model, prompt, size } = params;
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // fal uses `Key <token>`, not `Bearer`.
      'Authorization': `Key ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: `${prompt}${WATERMARK_SUFFIX}`,
      image_size: sizeMap[size],
      num_images: 1,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ImageGenError(res.status, `fal.ai ${res.status}: ${body.slice(0, 400)}`);
  }

  const data: FalResponse = await res.json();
  const first = data.images?.[0];
  if (!first?.url) {
    throw new ImageGenError(502, 'fal.ai returned no image URL');
  }

  // fal hosts the result; download once into the worker so we can
  // upload to our Storage. Skipping this and signing fal's URL would
  // expose the user to fal-side URL expiry / outages.
  const imgRes = await fetch(first.url);
  if (!imgRes.ok) {
    throw new ImageGenError(imgRes.status, `fetching fal result ${imgRes.status}`);
  }
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  return {
    bytes,
    mime: first.content_type ?? 'image/png',
    width: first.width ?? null,
    height: first.height ?? null,
  };
};
