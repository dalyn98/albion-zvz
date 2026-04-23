-- 073: 서버 RPC 들에 guild_id 를 전파한다.
--
-- 마이그 072 에서 21개 테이블에 guild_id uuid NOT NULL (DEFAULT 없음) 을
-- 걸었다. 앱 레이어의 INSERT 경로는 앞선 커밋에서 모두 guildId 를 넘기도록
-- 수정했지만, Postgres 함수 (RPC) 내부의 INSERT 는 여전히 guild_id 를 누락해
-- NOT NULL 위반으로 실패한다. 영향 받는 RPC 들을 여기서 다시 정의한다.
--
-- 전략:
--   - 요청 테이블(regear_requests, exchange_requests, donation_requests,
--     shop_orders) 에서 SELECT 할 때 guild_id 를 함께 꺼내와 point_ledger
--     INSERT 에 넣는다. 호출 API 를 건드리지 않아도 되는 장점.
--   - create_auto_regear_request 는 cron 에서 호출되므로 호출부가 guild_id 를
--     이미 알고 있다. p_guild_id 파라미터를 추가.
--   - transfer_points 는 송신자 discord_id 만 주어지는데, sender 의 guild 는
--     guild_avatars.guild_id 에서 조회해 추가 비용 없이 가져온다. 양도는
--     같은 길드 안에서만 허용되므로 송신자 = 수신자 = 동일 guild_id 로
--     설계 의도를 유지. (수신자들이 다른 길드 멤버이면 MEMBER_NOT_FOUND 가
--     그대로 던져진다 — 검증 쿼리가 guild_avatars 전역 스캔이라 향후 길드
--     격리 쿼리로 교체할 여지 있음.)
--   - apply_shop_stock_delta 는 shop_inventory 에 upsert 하므로 p_guild_id 를
--     받아 넘긴다. shop_inventory 의 UNIQUE (unique_name, enchant, quality) 는
--     현행 유지 — 나중에 (guild_id, unique_name, enchant, quality) 로 재구성할
--     여지는 있으나 단일 tenant 에서는 문제가 되지 않음.

-- ────────────────────────────────────────────────────────────
-- 1) approve_regear_request — regear_requests.guild_id 전파
-- ────────────────────────────────────────────────────────────
create or replace function public.approve_regear_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_payout_silver integer default null
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_claimed integer;
  v_credit  integer;
  v_guild   uuid;
begin
  select discord_id, claimed_silver, guild_id
    into v_discord, v_claimed, v_guild
    from regear_requests
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'REGEAR_NOT_PENDING';
  end if;

  v_credit := coalesce(p_payout_silver, v_claimed);
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > v_claimed then v_credit := v_claimed; end if;

  update regear_requests
     set status = 'approved',
         resolved_at = now(),
         payout_silver = v_credit,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (v_guild, v_discord, v_credit, 'regear_approved', p_id);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 2) approve_exchange_request — exchange_requests.guild_id 전파
-- ────────────────────────────────────────────────────────────
create or replace function public.approve_exchange_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_silver  integer;
  v_balance integer;
  v_guild   uuid;
begin
  select discord_id, silver, guild_id
    into v_discord, v_silver, v_guild
    from exchange_requests
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_discord, 0));

  select coalesce(sum(delta), 0) into v_balance
    from point_ledger where discord_id = v_discord;

  if v_balance < v_silver then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update exchange_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (v_guild, v_discord, -v_silver, 'exchange_paid', p_id);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 3) approve_donation_request — donation_requests.guild_id 전파
-- ────────────────────────────────────────────────────────────
create or replace function public.approve_donation_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_silver  integer;
  v_guild   uuid;
begin
  select discord_id, silver, guild_id
    into v_discord, v_silver, v_guild
    from donation_requests
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'DONATION_NOT_PENDING';
  end if;

  update donation_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (v_guild, v_discord, v_silver, 'donation_approved', p_id);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 4) approve_shop_order — shop_orders.guild_id 전파
-- ────────────────────────────────────────────────────────────
create or replace function public.approve_shop_order(
  p_id uuid,
  p_admin_id text,
  p_admin_note text default null
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_total   integer;
  v_balance integer;
  v_guild   uuid;
  v_line    record;
begin
  select discord_id, total_points, guild_id
    into v_discord, v_total, v_guild
    from shop_orders
   where id = p_id and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_discord, 0));

  select coalesce(sum(delta), 0) into v_balance
    from point_ledger where discord_id = v_discord;

  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  for v_line in
    select unique_name, enchant, quality, quantity
      from shop_order_items where order_id = p_id
  loop
    update shop_inventory
       set stock = stock - v_line.quantity,
           updated_at = now()
     where unique_name = v_line.unique_name
       and enchant     = v_line.enchant
       and quality     = v_line.quality
       and stock      >= v_line.quantity;

    if not found then
      raise exception 'INSUFFICIENT_STOCK: % @% q%',
        v_line.unique_name, v_line.enchant, v_line.quality;
    end if;
  end loop;

  update shop_orders
     set status = 'approved',
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note  = coalesce(p_admin_note, admin_note)
   where id = p_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (v_guild, v_discord, -v_total, 'shop_purchase', p_id);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 5) create_auto_regear_request — 호출부(cron)가 p_guild_id 전달
-- ────────────────────────────────────────────────────────────
-- 기존 시그니처(11개 인자) 를 drop 하고 12번째 파라미터로 p_guild_id 를 추가.
-- 호출부는 src/lib/auto-regear.ts — 마이그 적용 후 함께 갱신 필요.
drop function if exists public.create_auto_regear_request(
  uuid, text, text, text, text, integer, integer, integer, bigint, jsonb, text
);

create or replace function public.create_auto_regear_request(
  p_guild_id uuid,
  p_event_id uuid,
  p_event_title text,
  p_discord_id text,
  p_username text,
  p_role_name text,
  p_silver integer,
  p_claimed_silver integer,
  p_payout_silver integer,
  p_killboard_event_id bigint,
  p_gear_breakdown jsonb,
  p_price_warning_level text
) returns uuid language plpgsql security definer as $$
declare
  v_existing uuid;
  v_manual_count integer;
  v_new_id uuid;
  v_credit integer;
  v_role_cap integer;
begin
  select id into v_existing
    from regear_requests
   where event_id = p_event_id
     and killboard_event_id = p_killboard_event_id
     and auto_generated = true;
  if v_existing is not null then
    return v_existing;
  end if;

  select count(*) into v_manual_count
    from regear_requests
   where event_id = p_event_id
     and discord_id = p_discord_id
     and auto_generated = false
     and status <> 'rejected';
  if v_manual_count > 0 then
    return null;
  end if;

  select silver into v_role_cap
    from role_rewards
   where role_name = p_role_name;
  if v_role_cap is null or v_role_cap <= 0 then
    return null;
  end if;

  v_credit := p_payout_silver;
  if v_credit < 0 then v_credit := 0; end if;
  if v_credit > p_claimed_silver then v_credit := p_claimed_silver; end if;
  if v_credit > v_role_cap then v_credit := v_role_cap; end if;

  insert into regear_requests (
    guild_id,
    event_id, event_title_snapshot, discord_id, username, role_name,
    silver, claimed_silver, payout_silver,
    screenshot_path, killboard_verified, killboard_event_id,
    status, resolved_at, handled_by_username,
    auto_generated, gear_breakdown, request_type, price_warning_level
  ) values (
    p_guild_id,
    p_event_id, p_event_title, p_discord_id, p_username, p_role_name,
    p_silver, p_claimed_silver, v_credit,
    null, true, p_killboard_event_id,
    'pending', null, null,
    true, p_gear_breakdown, 'death', p_price_warning_level
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.create_auto_regear_request is
  'killboard_event 기반 자동 리기어 1건을 status=pending 으로 생성. point_ledger 적립은 하지 않고 관리자 승인(approve_regear_request) 시점에만 이루어진다. 재실행 idempotent — (event_id, killboard_event_id) 로 중복 방지. multi-tenant: p_guild_id 는 호출부(cron)가 전달.';

-- ────────────────────────────────────────────────────────────
-- 6) transfer_points — 송신자 guild_avatars.guild_id 에서 유도
-- ────────────────────────────────────────────────────────────
create or replace function public.transfer_points(p_from text, p_transfers jsonb)
returns uuid language plpgsql security definer as $$
declare
  v_ref       uuid := gen_random_uuid();
  v_total     integer := 0;
  v_balance   integer;
  v_recipient record;
  v_valid_ids integer;
  v_guild     uuid;
begin
  if p_from is null or p_from = '' then
    raise exception 'INVALID_SENDER';
  end if;

  if jsonb_typeof(p_transfers) <> 'array' or jsonb_array_length(p_transfers) = 0 then
    raise exception 'NO_RECIPIENTS';
  end if;

  -- 송신자 guild_id 확인 — guild_avatars 에 없으면 양도 권한 없음.
  select guild_id into v_guild
    from guild_avatars
   where discord_id = p_from;
  if v_guild is null then
    raise exception 'SENDER_NOT_MEMBER';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_from, 0));

  for v_recipient in
    select
      (elem->>'discord_id') as discord_id,
      coalesce(elem->>'username', '') as username,
      ((elem->>'amount')::numeric)::integer as amount,
      coalesce(elem->>'memo', null) as memo
    from jsonb_array_elements(p_transfers) as elem
  loop
    if v_recipient.discord_id is null or v_recipient.discord_id = '' then
      raise exception 'MEMBER_NOT_FOUND';
    end if;
    if v_recipient.discord_id = p_from then
      raise exception 'SELF_TRANSFER';
    end if;
    if v_recipient.amount is null or v_recipient.amount <= 0 then
      raise exception 'INVALID_AMOUNT';
    end if;
    v_total := v_total + v_recipient.amount;
  end loop;

  -- 수신자 존재 검증 — 동일 guild 안에서만.
  select count(*)
    into v_valid_ids
    from guild_avatars
   where guild_id = v_guild
     and discord_id in (
       select elem->>'discord_id'
         from jsonb_array_elements(p_transfers) as elem
     );
  if v_valid_ids <> (
    select count(distinct elem->>'discord_id')
      from jsonb_array_elements(p_transfers) as elem
  ) then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  select coalesce(sum(delta), 0) into v_balance
    from point_ledger where discord_id = p_from;
  if v_balance < v_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  for v_recipient in
    select
      (elem->>'discord_id') as discord_id,
      coalesce(elem->>'username', '') as username,
      ((elem->>'amount')::numeric)::integer as amount,
      coalesce(elem->>'memo', null) as memo
    from jsonb_array_elements(p_transfers) as elem
  loop
    insert into point_ledger (guild_id, discord_id, delta, reason, ref_id, memo)
         values (v_guild, p_from, -v_recipient.amount, 'transfer_out', v_ref,
                 coalesce(v_recipient.memo, v_recipient.username));
    insert into point_ledger (guild_id, discord_id, delta, reason, ref_id, memo)
         values (v_guild, v_recipient.discord_id, v_recipient.amount, 'transfer_in', v_ref,
                 coalesce(v_recipient.memo, p_from));
  end loop;

  return v_ref;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 7) apply_shop_stock_delta — p_guild_id 인자 추가
-- ────────────────────────────────────────────────────────────
-- 기존 7인자 시그니처 drop 후 p_guild_id 를 맨 앞에 추가한 8인자 버전으로 교체.
drop function if exists public.apply_shop_stock_delta(
  text, int, int, int, text, text, int
);

create or replace function public.apply_shop_stock_delta(
  p_guild_id    uuid,
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
    guild_id, unique_name, enchant, quality, stock, name_ko, category, tier
  ) values (
    p_guild_id, p_unique_name, p_enchant, p_quality, p_delta, p_name_ko, p_category, p_tier
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
