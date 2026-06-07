import {
  KeyNotConfiguredError,
  resolveKey,
} from '../../../../shared/keys.ts';
import {
  signMessageImageUrl,
  uploadGeneratedImage,
  uploadGeneratedImagePreview,
} from '../../../../shared/messageImages.ts';
import {
  ImageGenError,
  // Both the client and the tool object want the name `generateImage`;
  // alias the client so the tool keeps the export.
  generateImage as runImageGen,
} from '../imagegen.ts';
import { encodeJpegPreview } from '../imagePreview.ts';
import type { ImageSize } from '../../../../shared/imageModels.ts';
import type { Tool } from './index.ts';

interface Args {
  prompt?: unknown;
  size?: unknown;
}

const VALID_SIZES: readonly ImageSize[] = ['square', 'portrait', 'landscape'];

const parseSize = (raw: unknown): ImageSize => (
  typeof raw === 'string' && (VALID_SIZES as readonly string[]).includes(raw)
    ? raw as ImageSize
    : 'square'
);

export const generateImage: Tool = {
  name: 'generate_image',
  capabilitySlug: 'image-gen',
  description:
    'Generate an image from a natural-language prompt and deliver it back to the user. Use ONLY when the user explicitly asks to draw / generate / create / make an image, not for fetching existing images from the web (use web_search for that). Do not pre-judge whether a prompt is acceptable or self-censor a borderline request: always call this tool when the user asks for an image and let the image service\'s own safety filter make that decision. If the service declines the prompt, the tool result carries the reason — relay it to the user plainly (it was declined for policy, and roughly why) and suggest a rephrase. Never tell the user you created, generated, or sent an image unless this tool returned success in the same turn. On success the image is delivered automatically alongside your reply; still write a short text response describing what you generated.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Detailed description of the image to generate, in English. Be specific about subject, style, composition, lighting.',
      },
      size: {
        type: 'string',
        enum: ['square', 'portrait', 'landscape'],
        description: 'Aspect ratio. Default square; use portrait for phone wallpapers, landscape for banners / scenery.',
        default: 'square',
      },
    },
    required: ['prompt'],
    additionalProperties: false,
  },
  execute: async (rawArgs, ctx) => {
    const { prompt, size } = rawArgs as Args;
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      return { error: 'generate_image requires a non-empty `prompt` string.' };
    }

    // The key resolves from the owner's connected fal.ai credential or the
    // deployment's FAL_API_KEY env. Errors round-trip back to the LLM as
    // tool-result JSON so the model can relay a sensible message in the
    // user's language.
    let apiKey: string;
    try {
      const resolved = await resolveKey(ctx.admin, ctx.kek, {
        ownerId: ctx.ownerId,
        purpose: 'fal',
        platformKey: Deno.env.get('FAL_API_KEY') ?? null,
      });
      apiKey = resolved.key;
    } catch (err) {
      if (err instanceof KeyNotConfiguredError) {
        return {
          error: 'generate_image needs a fal.ai API key, which this bot has not configured. Tell the user image generation is not set up on this bot.',
        };
      }
      throw err;
    }

    try {
      const generated = await runImageGen({
        apiKey,
        model: ctx.capabilityConfig?.imageModel,
        prompt: prompt.trim(),
        size: parseSize(size),
        config: ctx.capabilityConfig ?? {},
      });
      // Path doubles as an audit handle: the tool call ID ties the
      // object back to the `tool_called` / `tool_responded` step rows.
      const { storagePath } = await uploadGeneratedImage(ctx.admin, {
        ownerId: ctx.ownerId,
        threadId: ctx.threadId,
        imageId: ctx.toolCallId,
        mime: generated.mime,
        bytes: generated.bytes,
      });
      const originalUrl = await signMessageImageUrl(ctx.admin, storagePath);

      // LINE caps an image message's previewImageUrl at 1MB, but our generated
      // PNGs run well over that, so handing LINE the full-res image as the
      // preview makes the in-chat thumbnail fail to render. Ship a downscaled
      // JPEG as the preview while originalContentUrl stays the untouched
      // full-res PNG the user gets on tap. Best-effort: if the thumbnail can't
      // be produced, fall back to the full-res URL so a preview hiccup never
      // costs the user the image they asked for.
      let previewUrl = originalUrl;
      try {
        const previewBytes = await encodeJpegPreview(generated.bytes);
        const { storagePath: previewPath } = await uploadGeneratedImagePreview(ctx.admin, {
          ownerId: ctx.ownerId,
          threadId: ctx.threadId,
          imageId: ctx.toolCallId,
          bytes: previewBytes,
        });
        previewUrl = await signMessageImageUrl(ctx.admin, previewPath);
      } catch (previewErr) {
        console.error('image preview generation failed; using full-res as preview', previewErr);
      }

      // Staged for the worker to drain into LINE messages after the loop.
      ctx.attachments.push({
        type: 'image',
        mime: generated.mime,
        sizeBytes: generated.bytes.byteLength,
        originalContentUrl: originalUrl,
        previewImageUrl: previewUrl,
        storagePath,
      });

      return {
        status: 'success',
        // The image is delivered out-of-band via attachments; the model
        // uses this status to know the call succeeded and write a reply.
        message: 'Image generated and delivered. Write a short text reply describing what you created.',
        width: generated.width,
        height: generated.height,
      };
    } catch (err) {
      if (err instanceof ImageGenError) {
        return {
          // Pass fal's own reason through so the model can explain what went
          // wrong in the user's language and react to it — if the prompt was
          // rejected (e.g. safety filter), suggest a rephrase; otherwise a
          // retry. The reason is from fal, not user input, so it's safe to relay.
          error: `Image generation failed (${err.status}): ${err.detail}. Briefly tell the user what went wrong in their language; if the prompt looks rejected, suggest rephrasing, otherwise suggest trying again.`,
        };
      }
      throw err;
    }
  },
};
