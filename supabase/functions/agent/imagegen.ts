// Uses fal's synchronous `https://fal.run/{model}` endpoint rather
// than the queue API: the supported models finish well under the worker's
// 400s wall clock, so polling buys nothing.

import type { CapabilityConfig } from '../../../shared/capabilities.ts';
import { type ImageSize, resolveImageModel } from '../../../shared/imageModels.ts';

export class ImageGenError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// Watermark suffix appended to every prompt. Prompt-based watermarks
// are unreliable (model may ignore, may draw something other than
// the exact text), so this is a best-effort MVP. A server-side
// composite is a follow-up if launch UX demands a guarantee.
const WATERMARK_SUFFIX = ", with small 'fermi' text watermark in bottom-right corner";

export interface ImageResult {
  bytes: Uint8Array;
  mime: string;
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
  // Owner-chosen model id; validated against the catalog allowlist (unknown ⇒
  // default) before it reaches the fal URL.
  model: unknown;
  prompt: string;
  size: ImageSize;
  // The capability's owner config (e.g. safetyTolerance). Each model's adapter
  // reads and validates the fields it supports.
  config: CapabilityConfig;
}): Promise<ImageResult> => {
  const { apiKey, model, prompt, size, config } = params;
  const spec = resolveImageModel(model);
  const res = await fetch(`https://fal.run/${spec.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // fal uses `Key <token>`, not `Bearer`.
      'Authorization': `Key ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: `${prompt}${WATERMARK_SUFFIX}`,
      num_images: 1,
      ...spec.buildParams(size, config),
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
