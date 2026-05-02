-- Super-admin tenant summary: replace N+1 head:true counts with one GROUP BY.
-- listAllTenantsWithStats() (src/lib/super-admin-stats.ts) 가 이전엔 테넌트당
-- guild_avatars + events 두 개씩 count 쿼리를 fan-out 했음. 100T 시 200 round-trip.
-- 한 번의 GROUP BY 로 묶어 round-trip 1 회로 압축.

create or replace function public.tenant_summary_counts()
returns table (guild_id uuid, member_count bigint, event_count bigint)
language sql
stable
security invoker
as $$
  with members as (
    select guild_id as gid, count(*)::bigint as cnt
    from public.guild_avatars
    where guild_id is not null
    group by guild_id
  ),
  evts as (
    select guild_id as gid, count(*)::bigint as cnt
    from public.events
    where guild_id is not null
    group by guild_id
  )
  select
    coalesce(m.gid, e.gid) as guild_id,
    coalesce(m.cnt, 0)::bigint as member_count,
    coalesce(e.cnt, 0)::bigint as event_count
  from members m
  full outer join evts e on m.gid = e.gid;
$$;

revoke execute on function public.tenant_summary_counts() from public;
grant execute on function public.tenant_summary_counts() to service_role;

comment on function public.tenant_summary_counts() is
  'Super-admin only: aggregate (guild_avatars, events) counts per tenant. One GROUP BY replaces N+1 head:true counts in listAllTenantsWithStats.';
