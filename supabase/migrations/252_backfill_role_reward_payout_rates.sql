-- 252: Before making each role's payout rate mandatory, preserve the rate
-- that legacy NULL rows resolved to. A malformed/missing guild setting uses
-- the long-standing safe default of 100%.
--
-- This is intentionally data-only. Migration 253 owns the schema contract.

update public.role_rewards as reward
set payout_rate_percent = coalesce(
  (
    select case
      when setting.value ~ '^(100|[1-9][0-9]?)$' then setting.value::integer
      else null
    end
    from public.app_settings as setting
    where setting.guild_id = reward.guild_id
      and setting.key = 'regear_payout_rate_percent'
  ),
  100
)
where reward.payout_rate_percent is null;
