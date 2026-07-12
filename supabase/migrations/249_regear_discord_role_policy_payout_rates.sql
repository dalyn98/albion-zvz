-- 249: Let each Discord-role regear policy define both its claim ceiling and payout rate.
--
-- Keep legacy rows nullable: before this migration their rate was resolved from
-- the existing event/role/guild policy, and a Discord role group can map to
-- multiple site roles with different rates. New writes require a 1..100 rate
-- in the server action, while NULL keeps historical policies behavior-stable
-- until an admin explicitly chooses their rate.

alter table public.regear_discord_role_policies
  add column if not exists payout_rate_percent integer;

alter table public.regear_discord_role_policies
  drop constraint if exists regear_discord_role_policies_payout_rate_percent_chk;

alter table public.regear_discord_role_policies
  add constraint regear_discord_role_policies_payout_rate_percent_chk
  check (
    payout_rate_percent is null
    or (payout_rate_percent >= 1 and payout_rate_percent <= 100)
  );

comment on column public.regear_discord_role_policies.payout_rate_percent is
  'Per-Discord-role payout rate override (1..100). NULL is legacy and falls back to event/role/guild payout policy.';
