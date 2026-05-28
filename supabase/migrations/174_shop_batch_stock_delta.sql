-- 174: 상점 재고 import 시 로그 행마다 RPC 를 호출하지 않도록 batch RPC 를 추가한다.
-- 기존 apply_shop_stock_delta 를 그대로 재사용해서 음수 재고 clamp, metadata 보존,
-- 빈 재고 row 정리 트리거 동작을 동일하게 유지한다.

create or replace function public.apply_shop_stock_deltas(
  p_guild_id uuid,
  p_deltas jsonb
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta record;
  v_applied int := 0;
begin
  if p_deltas is null or jsonb_typeof(p_deltas) <> 'array' then
    raise exception 'p_deltas must be a JSON array' using errcode = '22023';
  end if;

  for v_delta in
    select *
      from jsonb_to_recordset(p_deltas) as d(
        unique_name text,
        enchant int,
        quality int,
        delta int,
        name_ko text,
        category text,
        tier int
      )
  loop
    if v_delta.unique_name is null
       or btrim(v_delta.unique_name) = ''
       or v_delta.enchant is null
       or v_delta.quality is null
       or v_delta.delta is null then
      raise exception 'invalid stock delta payload' using errcode = '22023';
    end if;

    perform public.apply_shop_stock_delta(
      p_guild_id,
      v_delta.unique_name,
      v_delta.enchant,
      v_delta.quality,
      v_delta.delta,
      v_delta.name_ko,
      v_delta.category,
      v_delta.tier
    );
    v_applied := v_applied + 1;
  end loop;

  return v_applied;
end;
$$;

comment on function public.apply_shop_stock_deltas(uuid, jsonb) is
  '길드 상점 재고 델타를 한 RPC 호출 안에서 순서대로 적용한다. 기존 apply_shop_stock_delta 와 동일한 clamp/metadata 보존 규칙을 사용한다.';

revoke all on function public.apply_shop_stock_deltas(uuid, jsonb) from public;
revoke all on function public.apply_shop_stock_deltas(uuid, jsonb) from anon, authenticated;
grant execute on function public.apply_shop_stock_deltas(uuid, jsonb) to service_role;
