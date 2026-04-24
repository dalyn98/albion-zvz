-- 관리자 백필 엔드포인트 (/api/admin/killboard-backfill-equipment) 가 사용하는
-- helper RPC. tenant_battle_records 시간창 안에 들어오는 killer 행 중 equipment
-- 가 null 인 것의 event_id 를 반환. 업적/통계에 반영되는 범위만 우선 채우기
-- 위한 스코프 제한.

create or replace function killboard_killer_rows_needing_equipment(p_guild_id uuid)
returns table(event_id bigint)
language sql
security definer
set search_path = public
as $$
  select distinct ke.event_id
  from public.killboard_events ke
  inner join public.tenant_battle_records tbr on tbr.guild_id = ke.guild_id
  inner join public.battle_records br         on br.id = tbr.battle_record_id
  where ke.guild_id = p_guild_id
    and ke.role = 'killer'
    and ke.equipment is null
    and br.ended_at is not null
    and ke.occurred_at between tbr.started_at - interval '15 minutes'
                           and br.ended_at    + interval '15 minutes';
$$;

revoke all on function killboard_killer_rows_needing_equipment(uuid) from public;
grant execute on function killboard_killer_rows_needing_equipment(uuid) to authenticated, service_role;
