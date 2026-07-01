-- Scope pending exchange requests by tenant.
--
-- The original partial unique index was created before multi-tenant support and
-- only keyed on discord_id. The application now treats exchange_requests as
-- tenant-owned rows, so one pending request must be allowed per
-- (guild_id, discord_id), not globally per Discord account.

drop index if exists public.exchange_requests_one_pending_per_user;

create unique index if not exists exchange_requests_one_pending_per_member_per_guild
  on public.exchange_requests (guild_id, discord_id)
  where status = 'pending';
