// LINE's image message takes two URLs: `originalContentUrl` (capped at 10MB)
// and `previewImageUrl` (capped at 1MB). Our generated PNGs routinely run
// 1.3–1.9MB, so handing LINE the full-res PNG as the preview blows the 1MB cap
// and the thumbnail silently fails to render — the chat shows text but no
// image. This produces a downscaled JPEG to serve as that preview while the
// PNG stays the original.

// 1024px on the long edge at quality 80 lands a detailed illustration well
// under 1MB (typically 100–400KB) while staying crisp in LINE's bubble.
const PREVIEW_MAX_EDGE = 1024;
const PREVIEW_JPEG_QUALITY = 80;

// `imagescript` must be the Deno-native distribution (deno.land/x, pure WASM
// codecs), not `npm:imagescript`: the npm build's `codecs/node/index.js` does a
// `process.arch`/platform check and throws "unsupported arch/platform" on the
// Supabase Edge Runtime. The import map pins the deno.land URL; don't switch it
// back to npm:. (deno check passes either way locally — the host is real Node —
// so this only surfaces at runtime on edge.)
//
// Imported dynamically rather than at module top so a load failure on the edge
// runtime degrades to "no preview thumbnail" (the caller falls back to the
// full-res URL) instead of crashing the whole agent worker at boot. It also
// keeps the wasm decoder off the cold-start path of runs that never generate
// an image.
export const encodeJpegPreview = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const { Image } = await import('imagescript');
  const image = await Image.decode(bytes);
  const longEdge = Math.max(image.width, image.height);
  if (longEdge > PREVIEW_MAX_EDGE) {
    const scale = PREVIEW_MAX_EDGE / longEdge;
    image.resize(Math.round(image.width * scale), Math.round(image.height * scale));
  }
  return await image.encodeJPEG(PREVIEW_JPEG_QUALITY);
};
