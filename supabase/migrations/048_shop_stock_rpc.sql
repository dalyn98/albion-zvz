-- 상자 로그 임포트 시 (unique_name, enchant, quality) 슬롯에 수량 델타를
-- 누적하는 원자적 RPC. 여러 관리자가 동시에 임포트해도 손실 없이 합산되며
-- 없던 슬롯이면 새로 생성한다. 서버 액션에서 각 행마다 한 번씩 호출.

create or replace function public.apply_shop_stock_delta(
  p_unique_name text,
  p_enchant     int,
  p_quality     int,
  p_delta       int,
  p_name_ko     text,
  p_category    text,
  p_tier        int
) returns int language plpgsql as $$
declare
  v_stock int;
begin
  insert into shop_inventory (
    unique_name, enchant, quality, stock, name_ko, category, tier
  ) values (
    p_unique_name, p_enchant, p_quality, p_delta, p_name_ko, p_category, p_tier
  )
  on conflict (unique_name, enchant, quality) do update
     set stock      = shop_inventory.stock + excluded.stock,
         name_ko    = coalesce(excluded.name_ko, shop_inventory.name_ko),
         category   = coalesce(excluded.category, shop_inventory.category),
         tier       = coalesce(excluded.tier, shop_inventory.tier),
         updated_at = now()
  returning stock into v_stock;
  return v_stock;
end;
$$;
