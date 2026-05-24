-- Drops `bots.allow_groups`. Whether the OA receives group / room
-- webhook events is controlled by LINE itself ("Allow bot to join
-- group chats" in the Developers Console / OA Manager), so a fermi-
-- side toggle was always misleading: setting it off here couldn't
-- block events LINE delivered, and the worker never checked it
-- anyway. The runtime path (webhook handler, agent worker, lookup
-- helpers) never read this column — only the dashboard form did.

alter table public.bots
  drop column allow_groups;
