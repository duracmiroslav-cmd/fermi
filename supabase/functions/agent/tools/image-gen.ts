import {
  FreeBYOKRequiredError,
  PlatformKeyNotConfiguredError,
  resolveKey,
} from '../../../../shared/keys.ts';
import { signMessageImageUrl, uploadGeneratedImage } from '../../../../shared/messageImages.ts';
import {
  DEFAULT_IMAGE_MODEL,
  ImageGenError,
  type ImageSize,
  // Both the client and the tool object want the name `generateImage`;
  // alias the client so the tool keeps the export.
  generateImage as runImageGen,
} from '../imagegen.ts';
import { COUNTER_ENV, consumeQuota } from '../quota.ts';
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

// Owner config (not an LLM arg). Reject non-integers / out-of-band values so a
// stale or hand-edited config can't 4xx the call; undefined ⇒ fal's default.
const parseSafetyTolerance = (raw: unknown): number | undefined =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 6
    ? raw
    : undefined;

export const generateImage: Tool = {
  name: 'generate_image',
  capabilitySlug: 'image-gen',
  description:
    'Generate an image from a natural-language prompt and deliver it back to the user. Use ONLY when the user explicitly asks to draw / generate / create / make an image, not for fetching existing images from the web (use web_search for that). The image is delivered automatically alongside your text reply; you should still write a short text response describing what you generated.',
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

    // Tier policy: Free must BYOK fal.ai; Pro falls back to fermi's
    // platform key. Resolve the key before charging quota so a Free owner
    // with no key short-circuits without being charged an image unit.
    // Errors round-trip back to the LLM as tool-result JSON so the model
    // can relay a sensible message in the user's language.
    let apiKey: string;
    try {
      const resolved = await resolveKey(ctx.admin, ctx.kek, {
        ownerId: ctx.ownerId,
        purpose: 'fal',
        platformKey: Deno.env.get('FAL_API_KEY') ?? null,
      });
      apiKey = resolved.key;
    } catch (err) {
      if (err instanceof FreeBYOKRequiredError) {
        return {
          error: 'generate_image requires a fal.ai API key. Tell the user the bot owner needs to either connect fal.ai at https://fermi.tw/dashboard/connectors (~$0.04 per image, sign up at https://fal.ai) or upgrade to Pro so fermi handles it.',
        };
      }
      if (err instanceof PlatformKeyNotConfiguredError) {
        return {
          error: 'generate_image is temporarily unavailable. Tell the user that fermi\'s Pro image generation backend is down and to try again shortly.',
        };
      }
      throw err;
    }

    // Quota after the key resolves: a fast-fail before the paid fal.ai call
    // that doesn't charge an owner who couldn't have generated anyway.
    const quota = await consumeQuota(ctx.admin, COUNTER_ENV, {
      ownerId: ctx.ownerId,
      purpose: 'image_gen',
    });
    if (!quota.allowed) {
      return {
        error: `Image generation quota exceeded: ${quota.count}/${quota.cap} this month. Tell the user the bot owner's free image quota is used up; they can either upgrade to Pro at https://fermi.tw/dashboard/billing ($19/mo, 200 images/mo) or connect their own fal.ai key at https://fermi.tw/dashboard/connectors for unlimited usage.`,
      };
    }

    try {
      const generated = await runImageGen({
        apiKey,
        model: DEFAULT_IMAGE_MODEL,
        prompt: prompt.trim(),
        size: parseSize(size),
        safetyTolerance: parseSafetyTolerance(ctx.capabilityConfig?.safetyTolerance),
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
      const signedUrl = await signMessageImageUrl(ctx.admin, storagePath);

      // Staged for the worker to drain into LINE messages after the loop.
      ctx.attachments.push({
        type: 'image',
        mime: generated.mime,
        sizeBytes: generated.bytes.byteLength,
        originalContentUrl: signedUrl,
        previewImageUrl: signedUrl,
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
          error: `Image generation failed (${err.status}). Tell the user briefly that the image service errored; suggest they try again or rephrase the prompt.`,
        };
      }
      throw err;
    }
  },
};
