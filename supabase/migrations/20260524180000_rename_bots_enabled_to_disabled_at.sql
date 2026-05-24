-- Renames `bots.enabled boolean` to `bots.disabled_at timestamptz`,
-- bringing the bot's pause state in line with the table's other
-- lifecycle column (`deleted_at`). The boolean was a stylistic split
-- — same conceptual axis (active vs not-active), two different
-- column shapes. Going to `disabled_at` also unlocks "paused since
-- 2026-05-20" UI and audit / billing-pause workflows.
--
-- `allow_groups` stays boolean — it's a feature flag, not a
-- lifecycle state, so a timestamp would be dead weight.

alter table public.bots
  add column disabled_at timestamptz;

-- Backfill: any row previously disabled (enabled = false) gets its
-- `updated_at` copied in as a best-effort "when did this happen"
-- — that's the last time the row was touched, which for a disabled
-- bot is almost certainly when it was disabled.
update public.bots
   set disabled_at = updated_at
 where enabled = false;

alter table public.bots
  drop column enabled;
