-- Seeds the `image-gen` builtin capability so agents can attach it
-- via the existing capability flow (capability_id FK in
-- agent_capabilities). The runtime tool implementation lives at
-- `supabase/functions/agent/tools/image-gen.ts` and registers itself
-- under `capabilitySlug: 'image-gen'`; the worker's
-- `toolSchemasForCapabilities` filter wires the two together.

insert into public.capabilities (type, slug, display_name, description) values
  ('mcp', 'image-gen', 'Image generation',
   'Generate an image from a natural-language prompt. Use when the user explicitly asks to "draw", "generate an image", "make a picture", or similar; do NOT use to fetch existing images from the web.');
