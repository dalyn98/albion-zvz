-- 119: shop 주문 제출을 단일 트랜잭션 RPC 로 전환.
--
-- 기존 src/app/actions/shop-member.ts 의 submitShopOrder 는:
--   1) shop_orders insert
--   2) 성공한 id 로 shop_order_items insert (별도 round-trip)
--   3) 2가 실패하면 catch 에서 1) 행을 delete 로 롤백
-- 으로 두 번의 round-trip + 자체 롤백 패턴이라, 2 단계가 부분 성공 후 connection
-- drop / pod restart 등으로 죽으면 orderId 만 남고 line 이 0 인 좀비 주문이 생길
-- 위험이 있다. 자체 롤백 자체도 실패 가능 (네트워크/DB 단절 시 catch 로 못 들어감).
--
-- 본 RPC 는 PL/pgSQL 함수 = 자동 트랜잭션이라 두 insert 가 원자적으로 묶인다 —
-- 어느 한 단계라도 raise 하면 양쪽 다 롤백되어 좀비 주문 0건 보장.
--
-- 신뢰 모델: caller (서버 액션) 가 이미 인증된 길드원의 입력만 넘긴다고 가정 —
-- 가격/재고/잔액 검증은 caller 에서 처리 (shop-member.ts). 이 RPC 는 schema 검증
-- (음수/공백 차단) 과 트랜잭션 묶음에 집중한다. 잔액 hold 는 안 함 — 결제 시점은
-- 관리자 승인의 approve_shop_order RPC.

create or replace function public.submit_shop_order(
  p_guild_id     uuid,
  p_discord_id   text,
  p_username     text,
  p_total_points integer,
  p_member_note  text,
  p_lines        jsonb
) returns uuid language plpgsql security definer as $$
declare
  v_order_id uuid;
begin
  -- schema 가드. CHECK constraint 가 다 잡지만, 의미 있는 에러 메시지로
  -- 노출하기 위해 명시적으로 raise.
  if p_guild_id is null then
    raise exception 'GUILD_REQUIRED';
  end if;
  if p_discord_id is null or btrim(p_discord_id) = '' then
    raise exception 'DISCORD_REQUIRED';
  end if;
  if p_total_points is null or p_total_points <= 0 then
    raise exception 'TOTAL_POINTS_NOT_POSITIVE';
  end if;
  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'LINES_EMPTY';
  end if;

  insert into public.shop_orders (
    guild_id, discord_id, username, total_points, status, member_note
  ) values (
    p_guild_id,
    p_discord_id,
    p_username,
    p_total_points,
    'pending',
    nullif(btrim(coalesce(p_member_note, '')), '')
  )
  returning id into v_order_id;

  -- 라인 일괄 삽입. jsonb_array_elements 로 expand 후 INSERT ... SELECT.
  -- 라인 1건이라도 CHECK constraint (quantity > 0, unit_points >= 0 등)에
  -- 걸리면 전체 트랜잭션 롤백 → shop_orders 행도 사라진다.
  insert into public.shop_order_items (
    guild_id, order_id, unique_name, enchant, quality, name_ko,
    quantity, unit_points, subtotal_points
  )
  select
    p_guild_id,
    v_order_id,
    l->>'unique_name',
    (l->>'enchant')::int,
    (l->>'quality')::int,
    l->>'name_ko',
    (l->>'quantity')::int,
    (l->>'unit_points')::int,
    (l->>'subtotal_points')::int
  from jsonb_array_elements(p_lines) as l;

  return v_order_id;
end;
$$;

comment on function public.submit_shop_order(uuid, text, text, integer, text, jsonb) is
  '길드원 상점 주문 제출 — shop_orders + shop_order_items 를 단일 트랜잭션으로 삽입. caller 측 검증(가격/재고/잔액) 통과 후 호출.';
