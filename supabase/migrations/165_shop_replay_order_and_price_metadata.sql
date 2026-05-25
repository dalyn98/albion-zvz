-- 165: 상점 로그 리플레이 순서를 안정화하고, 재고가 0을 지나 다시 입고될 때
-- 수동 가격 / 자동 시세 메타데이터가 사라지지 않게 보완한다.

alter table public.shop_chest_logs
  add column if not exists import_sequence int;

create index if not exists shop_chest_logs_replay_order_idx
  on public.shop_chest_logs (
    guild_id,
    logged_at asc,
    imported_at asc,
    import_sequence asc
  );

create or replace function public.shop_inventory_delete_when_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.stock <= 0
     and NEW.manual_price is null
     and NEW.auto_price_silver is null
     and NEW.price_source is null
     and NEW.price_warning_level is null
     and NEW.price_updated_at is null then
    delete from public.shop_inventory where id = NEW.id;
  end if;
  return null;
end;
$$;

create or replace function public.apply_shop_stock_delta(
  p_guild_id    uuid,
  p_unique_name text,
  p_enchant     int,
  p_quality     int,
  p_delta       int,
  p_name_ko     text,
  p_category    text,
  p_tier        int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock int;
begin
  update public.shop_inventory
     set stock      = greatest(stock + p_delta, 0),
         name_ko    = coalesce(p_name_ko, name_ko),
         category   = coalesce(p_category, category),
         tier       = coalesce(p_tier, tier),
         updated_at = now()
   where guild_id = p_guild_id
     and unique_name = p_unique_name
     and enchant = p_enchant
     and quality = p_quality
   returning stock into v_stock;

  if found then
    return greatest(coalesce(v_stock, 0), 0);
  end if;

  -- 출고 로그만 먼저 들어온 경우 음수 재고 행을 만들지 않는다.
  if p_delta <= 0 then
    return 0;
  end if;

  insert into public.shop_inventory (
    guild_id, unique_name, enchant, quality, stock, name_ko, category, tier
  ) values (
    p_guild_id, p_unique_name, p_enchant, p_quality, p_delta, p_name_ko, p_category, p_tier
  )
  on conflict (guild_id, unique_name, enchant, quality) do update
     set stock      = greatest(public.shop_inventory.stock + excluded.stock, 0),
         name_ko    = coalesce(excluded.name_ko, public.shop_inventory.name_ko),
         category   = coalesce(excluded.category, public.shop_inventory.category),
         tier       = coalesce(excluded.tier, public.shop_inventory.tier),
         updated_at = now()
  returning stock into v_stock;

  return greatest(coalesce(v_stock, 0), 0);
end;
$$;

do $$
declare
  v_sql text;
  v_next_sql text;
  v_replay_order text := 'order by l.logged_at asc,
              l.imported_at asc,
              l.import_sequence asc nulls last,
              l.player asc,
              l.item_name_raw asc,
              l.enchant asc,
              l.quality asc,
              l.quantity asc,
              l.id asc';
begin
  select pg_get_functiondef('public.rebuild_shop_inventory_from_chest_logs(uuid,timestamptz)'::regprocedure)
    into v_sql;
  if v_sql is not null and position('l.import_sequence asc nulls last' in v_sql) = 0 then
    v_next_sql := regexp_replace(
      v_sql,
      'order by\s+l\.logged_at asc,\s+l\.id asc',
      v_replay_order,
      'g'
    );
    if v_next_sql = v_sql then
      raise exception 'failed to patch rebuild_shop_inventory_from_chest_logs replay order';
    end if;
    execute v_next_sql;
  end if;

  select pg_get_functiondef(
    'public.apply_shop_baseline(uuid,timestamptz,timestamptz,jsonb,int,int,text,text,text)'::regprocedure
  ) into v_sql;
  if v_sql is not null and position('l.import_sequence asc nulls last' in v_sql) = 0 then
    v_next_sql := regexp_replace(
      v_sql,
      'order by\s+l\.logged_at asc,\s+l\.id asc',
      v_replay_order,
      'g'
    );
    if v_next_sql = v_sql then
      raise exception 'failed to patch apply_shop_baseline replay order';
    end if;
    execute v_next_sql;
  end if;
end;
$$;

comment on column public.shop_chest_logs.import_sequence is
  '상자 로그 붙여넣기 배치 안에서의 원본 행 순서. 같은 logged_at 로그를 재계산할 때 UUID 대신 이 값을 우선 사용한다.';

comment on function public.shop_inventory_delete_when_empty() is
  'stock<=0 행을 자동 정리하되, 가격 메타데이터가 있는 행은 0 재고로 보존해 재입고 시 수동/자동 가격 설정을 잃지 않게 한다.';

revoke all on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) from public;
revoke all on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) from anon, authenticated;
grant execute on function public.apply_shop_stock_delta(uuid, text, int, int, int, text, text, int) to service_role;
