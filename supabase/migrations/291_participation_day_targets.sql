-- 291: Allow guilds to evaluate participation by session rules, distinct
-- guild-local participation days, or either rule.
--
-- Existing guilds remain session-only. Calendar-day counting stays in the
-- application because each tenant's IANA timezone is stored in app_settings.

alter table public.alliance_content_policies
  add column if not exists session_target_enabled boolean not null default true,
  add column if not exists participation_days_target_enabled boolean not null default false,
  add column if not exists weekly_min_participation_days integer not null default 0;

alter table public.alliance_content_policies
  add constraint alliance_content_policies_participation_days_range
    check (weekly_min_participation_days between 0 and 7),
  add constraint alliance_content_policies_target_enabled
    check (session_target_enabled or participation_days_target_enabled),
  add constraint alliance_content_policies_enabled_days_positive
    check (
      not participation_days_target_enabled
      or weekly_min_participation_days between 1 and 7
    );
