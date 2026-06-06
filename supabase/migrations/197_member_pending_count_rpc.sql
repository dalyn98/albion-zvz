-- Member pending request count RPC.
--
-- AppShell renders on most authenticated pages. Keep the member status chip
-- from issuing three separate pending-count requests on every render.

create index if not exists regear_requests_member_pending_idx
  on public.regear_requests (guild_id, discord_id)
  where status = 'pending';

create index if not exists exchange_requests_member_pending_idx
  on public.exchange_requests (guild_id, discord_id)
  where status = 'pending';

create index if not exists donation_requests_member_pending_idx
  on public.donation_requests (guild_id, discord_id)
  where status = 'pending';

create or replace function public.member_pending_request_counts(
  p_guild_id uuid,
  p_discord_id text
)
returns table (
  regear bigint,
  exchange bigint,
  donation bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)::bigint
      from public.regear_requests rr
      where rr.guild_id = p_guild_id
        and rr.discord_id = p_discord_id
        and rr.status = 'pending'
    ) as regear,
    (
      select count(*)::bigint
      from public.exchange_requests er
      where er.guild_id = p_guild_id
        and er.discord_id = p_discord_id
        and er.status = 'pending'
    ) as exchange,
    (
      select count(*)::bigint
      from public.donation_requests dr
      where dr.guild_id = p_guild_id
        and dr.discord_id = p_discord_id
        and dr.status = 'pending'
    ) as donation;
$$;

revoke all on function public.member_pending_request_counts(uuid, text) from public;
revoke all on function public.member_pending_request_counts(uuid, text) from anon, authenticated;
grant execute on function public.member_pending_request_counts(uuid, text) to service_role;
