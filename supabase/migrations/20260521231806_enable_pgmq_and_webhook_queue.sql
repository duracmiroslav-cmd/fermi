-- Creates the `webhook_events` pgmq queue and the
-- `public.enqueue_webhook_event` SECURITY DEFINER wrapper used by the
-- Nuxt webhook handler to enqueue jobs without touching the `pgmq`
-- schema directly.
--
-- The wrapper is granted to `service_role` only; anon and authenticated
-- roles cannot enqueue, so a leaked anon key cannot flood the queue.

create extension if not exists pgmq;

select pgmq.create('webhook_events');

create function public.enqueue_webhook_event(payload jsonb) returns bigint
  language sql
  security definer
  set search_path = public
as $$
  select pgmq.send('webhook_events', payload);
$$;

revoke execute on function public.enqueue_webhook_event(jsonb) from public;
grant execute on function public.enqueue_webhook_event(jsonb) to service_role;
