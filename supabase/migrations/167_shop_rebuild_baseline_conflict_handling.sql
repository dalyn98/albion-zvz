-- 167: 가격 메타데이터 보존으로 stock=0 행이 남아 있는 상태에서도
-- 베이스라인 기반 상점 재고 재계산이 같은 SKU 를 안전하게 갱신하게 한다.

do $$
declare
  v_sql text;
  v_next_sql text;
  v_conflict_sql text := 'where s.quantity > 0
    on conflict (guild_id, unique_name, enchant, quality) do update
       set stock               = excluded.stock,
           name_ko             = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
           category            = coalesce(excluded.category, public.shop_inventory.category),
           tier                = coalesce(excluded.tier, public.shop_inventory.tier),
           manual_price        = coalesce(public.shop_inventory.manual_price, excluded.manual_price),
           auto_price_silver   = coalesce(public.shop_inventory.auto_price_silver, excluded.auto_price_silver),
           price_source        = coalesce(public.shop_inventory.price_source, excluded.price_source),
           price_warning_level = coalesce(public.shop_inventory.price_warning_level, excluded.price_warning_level),
           price_updated_at    = coalesce(public.shop_inventory.price_updated_at, excluded.price_updated_at),
           updated_at          = now();
    v_replay_start := v_baseline_at;';
begin
  select pg_get_functiondef('public.rebuild_shop_inventory_from_chest_logs(uuid,timestamptz)'::regprocedure)
    into v_sql;

  if v_sql is not null
     and position('v_replay_start := v_baseline_at' in v_sql) > 0
     and position('on conflict (guild_id, unique_name, enchant, quality) do update' in v_sql) = 0 then
    v_next_sql := regexp_replace(
      v_sql,
      'where s\.quantity > 0;\s+v_replay_start := v_baseline_at;',
      v_conflict_sql,
      'g'
    );
    if v_next_sql = v_sql then
      raise exception 'failed to patch rebuild_shop_inventory_from_chest_logs baseline conflict handling';
    end if;
    execute v_next_sql;
  end if;
end;
$$;

comment on function public.rebuild_shop_inventory_from_chest_logs(uuid, timestamptz) is
  '길드 상자 로그를 운영 시작시간부터 순서대로 다시 적용해 shop_inventory 를 재계산한다. 기존 가격 메타데이터가 있는 stock=0 행은 보존하고 베이스라인 스냅샷은 같은 SKU 를 갱신한다.';
