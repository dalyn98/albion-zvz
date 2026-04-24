-- 멤버 프로필 페이지 "킬 상위 N%" / "참여 상위 N%" 를 계산하려면 길드 전체
-- 멤버 수준의 kills/participations 집계가 필요하다. PostgREST 는 group by 를
-- 직접 내려주지 않고 default limit 1000 에 걸리므로 RPC 로 집계해서 멤버 수(수십
-- ~수백) 만큼의 행만 반환한다. 집계는 같은 쿼리 내에서 killboard_events 와
-- slots 를 합쳐 한 번에 돌려 N+1 을 피한다.
--
-- 반환 행:
--   discord_id     — 길드 멤버 식별자
--   kills          — killboard_events role='killer' 누적
--   deaths         — killboard_events role='victim' 누적
--   participations — distinct event_id 수 (같은 이벤트 다중 슬롯은 1로)

create or replace function member_ranking_counts(p_guild_id uuid)
returns table(
  discord_id     text,
  kills          integer,
  deaths         integer,
  participations integer
)
language sql
security definer
set search_path = public
as $$
  with k as (
    select
      ke.discord_id,
      count(*) filter (where ke.role = 'killer')::integer as kills,
      count(*) filter (where ke.role = 'victim')::integer as deaths
    from public.killboard_events ke
    where ke.guild_id = p_guild_id
    group by ke.discord_id
  ),
  p as (
    select
      s.assigned_discord_id                as discord_id,
      count(distinct pa.event_id)::integer as participations
    from public.slots s
    inner join public.parties pa on pa.id = s.party_id
    where s.guild_id = p_guild_id
      and s.assigned_discord_id is not null
    group by s.assigned_discord_id
  ),
  ids as (
    select discord_id from k
    union
    select discord_id from p
  )
  select
    ids.discord_id,
    coalesce(k.kills, 0)          as kills,
    coalesce(k.deaths, 0)         as deaths,
    coalesce(p.participations, 0) as participations
  from ids
  left join k on k.discord_id = ids.discord_id
  left join p on p.discord_id = ids.discord_id;
$$;

revoke all on function member_ranking_counts(uuid) from public;
grant execute on function member_ranking_counts(uuid) to authenticated, service_role;
