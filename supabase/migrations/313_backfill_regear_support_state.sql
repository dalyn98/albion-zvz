-- Introduce the explicit tenant-level regear support state without changing the
-- behaviour of guilds that already completed onboarding.
--
-- Existing non-pending tenants retain their current regear behaviour. Pending
-- tenants intentionally remain without a row so the final onboarding step must
-- collect an explicit supported/unsupported choice.

set local statement_timeout = '30s';
set local lock_timeout = '5s';

insert into public.app_settings (guild_id, key, value, updated_at)
select id, 'regear_support_enabled', 'true', now()
  from public.tenants
 where status <> 'pending'
on conflict (guild_id, key) do nothing;

comment on column public.app_settings.value is
  'Setting value. regear_support_enabled uses true=supported, false=unsupported; a missing row means onboarding has not selected a state.';
