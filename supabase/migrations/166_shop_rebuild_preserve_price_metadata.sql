-- 166: 운영 시작 기준 재계산 / 베이스라인 확정 시 stock=0 이 된 가격 설정 행을
-- 삭제하지 않고 보존한다. 수동 가격과 자동 시세 메타데이터가 재입고 때 이어져야 한다.

do $$
declare
  v_sql text;
  v_next_sql text;
  v_zero_inventory_sql text := 'update public.shop_inventory
     set stock = 0,
         updated_at = now()
   where guild_id = p_guild_id;';
begin
  select pg_get_functiondef('public.rebuild_shop_inventory_from_chest_logs(uuid,timestamptz)'::regprocedure)
    into v_sql;
  if v_sql is not null and position('delete from public.shop_inventory' in v_sql) > 0 then
    v_next_sql := regexp_replace(
      v_sql,
      'delete from public\.shop_inventory\s+where guild_id = p_guild_id;',
      v_zero_inventory_sql,
      'g'
    );
    if v_next_sql = v_sql then
      raise exception 'failed to patch rebuild_shop_inventory_from_chest_logs inventory reset';
    end if;
    execute v_next_sql;
  end if;

  select pg_get_functiondef(
    'public.apply_shop_baseline(uuid,timestamptz,timestamptz,jsonb,int,int,text,text,text)'::regprocedure
  ) into v_sql;
  if v_sql is not null and position('delete from public.shop_inventory' in v_sql) > 0 then
    v_next_sql := regexp_replace(
      v_sql,
      'delete from public\.shop_inventory\s+where guild_id = p_guild_id;',
      v_zero_inventory_sql,
      'g'
    );
    if v_next_sql = v_sql then
      raise exception 'failed to patch apply_shop_baseline inventory reset';
    end if;
    execute v_next_sql;
  end if;
end;
$$;

comment on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) is
  '길드 상자 로그를 운영 시작시간부터 순서대로 다시 적용해 shop_inventory 를 재계산한다. 기존 가격 메타데이터가 있는 stock=0 행은 보존한다.';

comment on function public.apply_shop_baseline(uuid, timestamptz, timestamptz, jsonb, int, int, text, text, text) is
  '상점 베이스라인을 확정하고 이후 상자 로그를 순서대로 리플레이한다. 기존 가격 메타데이터가 있는 stock=0 행은 보존한다.';
