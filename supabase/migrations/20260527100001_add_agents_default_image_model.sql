-- Per-agent override for the image-gen model. Null = use the
-- worker's hardcoded default (`fal-ai/nano-banana`). Same nullable
-- pattern as `default_text_model` so the runtime fallback lives in
-- one place (`agent.defaultImageModel ?? DEFAULT_IMAGE_MODEL`).
--
-- Decoupled from the `image-gen` capability attachment: a user can
-- attach the capability and stick with default, or override the
-- model without touching attachment state.

alter table public.agents
  add column default_image_model text;
