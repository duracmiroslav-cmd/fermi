-- Adds `error_code` to `agent_runs` so dashboards can `GROUP BY
-- error_code` to surface "429 rate limit" vs "upstream 5xx" vs
-- "timeout" buckets without scanning step payloads. Worker should
-- pass the bucket name to `finishRun` when transitioning to
-- `failed`; left null for `succeeded` runs.
--
-- Backfilled from existing `error_occurred` step payloads using the
-- HTTP-status → bucket mapping the worker is expected to mirror.

alter table public.agent_runs
  add column error_code text;

-- 429 → rate_limited
-- 408 / 504 → timeout
-- 5xx → upstream_error
-- anything else → unknown
-- Regex guards the 5xx test so a non-numeric status never throws on cast.
update public.agent_runs r
   set error_code = case
     when s.payload->>'status' = '429'           then 'rate_limited'
     when s.payload->>'status' in ('408', '504') then 'timeout'
     when s.payload->>'status' ~ '^5[0-9]{2}$'   then 'upstream_error'
     else 'unknown'
   end
  from public.agent_run_steps s
 where s.run_id = r.id
   and s.type   = 'error_occurred'
   and r.status = 'failed'
   and r.error_code is null;
