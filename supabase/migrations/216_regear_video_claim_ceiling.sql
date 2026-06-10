-- Store the original role/event cap separately so `regear_requests.silver`
-- can continue satisfying the existing claimed_silver <= silver constraint as
-- the effective claim ceiling. Existing rows backfill base_silver from silver.
alter table public.regear_requests
  add column if not exists base_silver integer;

update public.regear_requests
   set base_silver = silver
 where base_silver is null;

alter table public.regear_requests
  drop constraint if exists regear_requests_base_silver_chk;

alter table public.regear_requests
  add constraint regear_requests_base_silver_chk
  check (base_silver is null or base_silver >= 0);

comment on column public.regear_requests.base_silver is
  'Original role/event regear ceiling snapshot before video-proof ceiling multiplier. silver remains the effective claim ceiling constrained against claimed_silver.';

insert into public.app_settings (guild_id, key, value, updated_at)
select id, 'regear_video_claim_ceiling_rate_percent', '100', now()
  from public.tenants
on conflict (guild_id, key) do nothing;
