-- Drops the never-wired `default_image_model` column. It was added as a
-- per-agent override but nothing ever set it (no UI / API / create RPC)
-- and nothing read it -- the image-gen tool uses the hardcoded
-- DEFAULT_IMAGE_MODEL constant directly, so the column sat NULL on every
-- agent.
--
-- Per the capability-vs-core-function rule (.claude/rules/backend.md):
-- image-gen is a capability, so a future per-agent model override belongs
-- in `agent_capabilities.config`, not as a flat column on `agents`.

alter table public.agents
  drop column default_image_model;
