-- 253: Every role reward now owns an explicit payout rate. This avoids a
-- hidden change to role payouts whenever the guild-wide fallback is edited.
--
-- Migration 252 must run immediately before this one to populate legacy rows.

alter table public.role_rewards
  alter column payout_rate_percent set not null;

alter table public.role_rewards
  drop constraint if exists role_rewards_payout_rate_percent_check;

alter table public.role_rewards
  add constraint role_rewards_payout_rate_percent_check
  check (payout_rate_percent >= 1 and payout_rate_percent <= 100);

comment on column public.role_rewards.payout_rate_percent is
  'Required per-role regear payout rate (1..100). Legacy rows were backfilled from the guild default in migration 252.';
