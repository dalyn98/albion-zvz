-- 088: cross-tenant 잔고/양도 가드.
--
-- 배경: 마이그 084 가 `guild_avatars`/`guests` PK 를 (guild_id, discord_id) 복합으로
-- 바꾸면서 같은 Discord 유저가 여러 tenant 에 동시 존재할 수 있게 됐다. 마이그 085
-- 는 regear/exchange/donation 의 approve/reject RPC 를 막았지만, 같은 부류의
-- 다음 두 RPC 를 빠뜨렸다:
--
--   1) approve_shop_order — point_ledger 잔고 합산이 guild_id 필터 없이 글로벌
--      합산. 두 길드에 속한 유저가 있으면 B 길드 관리자가 A 길드 포인트로 결제 가능.
--   2) transfer_points  — sender 의 guild_id 를 `select into v_guild` 로 단건
--      조회. 마이그 084 이후 두 길드 소속 유저는 SELECT INTO 가 TOO_MANY_ROWS 로
--      터지거나 임의 길드를 선택. 잔고 합산도 guild_id 필터 없음.
--
-- 본 마이그는 두 RPC 모두 명시적 p_guild_id 파라미터 + WHERE/INSERT 에 guild_id
-- 바인딩을 추가한다. 마이그 085 패턴 동일.

-- ────────────────────────────────────────────────────────────
-- 1) approve_shop_order — point_ledger 잔고 쿼리에 guild_id 필터.
--    p_guild_id 도 추가해서 마이그 085 의 가드 패턴 통일.
-- ────────────────────────────────────────────────────────────
create or replace function public.approve_shop_order(
  p_id uuid,
  p_admin_id text,
  p_guild_id uuid,
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
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_discord, 0));

  select coalesce(sum(delta), 0) into v_balance
    from point_ledger
   where guild_id = v_guild
     and discord_id = v_discord;

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
     where guild_id      = v_guild
       and unique_name   = v_line.unique_name
       and enchant       = v_line.enchant
       and quality       = v_line.quality
       and stock        >= v_line.quantity;

    if not found then
      raise exception 'INSUFFICIENT_STOCK: % @% q%',
        v_line.unique_name, v_line.enchant, v_line.quality;
    end if;
  end loop;

  update shop_orders
     set status      = 'approved',
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note  = coalesce(p_admin_note, admin_note)
   where id = p_id
     and guild_id = v_guild;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (v_guild, v_discord, -v_total, 'shop_purchase', p_id);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 2) reject_shop_order — guild_id 가드 추가 (대칭성).
--    잔고/재고 변동 없는 단순 상태 전환이지만 다른 길드 주문을 임의로 거절
--    당하지 않도록 동일 패턴 적용.
-- ────────────────────────────────────────────────────────────
create or replace function public.reject_shop_order(
  p_id uuid,
  p_admin_id text,
  p_guild_id uuid,
  p_admin_note text default null
) returns void language plpgsql security definer as $$
begin
  update shop_orders
     set status      = 'rejected',
         resolved_at = now(),
         resolved_by = p_admin_id,
         admin_note  = coalesce(p_admin_note, admin_note)
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending';

  if not found then
    raise exception 'ORDER_NOT_PENDING';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 3) transfer_points — 명시적 p_guild_id 파라미터로 받고 모든 쿼리/INSERT
--    에 guild_id = p_guild_id 바인딩. 양도는 동일 길드 내에서만 의미가
--    있으므로 호출부 (src/app/actions/transfer.ts) 가 sender 의 세션 길드 id
--    를 그대로 전달.
-- ────────────────────────────────────────────────────────────
create or replace function public.transfer_points(
  p_from text,
  p_guild_id uuid,
  p_transfers jsonb
) returns uuid language plpgsql security definer as $$
declare
  v_ref       uuid := gen_random_uuid();
  v_total     integer := 0;
  v_balance   integer;
  v_recipient record;
  v_valid_ids integer;
  v_distinct  integer;
  v_exists    integer;
begin
  if p_from is null or p_from = '' then
    raise exception 'INVALID_SENDER';
  end if;

  if p_guild_id is null then
    raise exception 'INVALID_GUILD';
  end if;

  if jsonb_typeof(p_transfers) <> 'array' or jsonb_array_length(p_transfers) = 0 then
    raise exception 'NO_RECIPIENTS';
  end if;

  -- sender 가 이 길드의 멤버인지 확인.
  select count(*) into v_exists
    from guild_avatars
   where guild_id = p_guild_id
     and discord_id = p_from;
  if v_exists = 0 then
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

  -- 수신자 전원이 같은 길드 멤버인지 확인.
  select count(*)
    into v_valid_ids
    from guild_avatars
   where guild_id = p_guild_id
     and discord_id in (
       select elem->>'discord_id'
         from jsonb_array_elements(p_transfers) as elem
     );
  select count(distinct elem->>'discord_id')
    into v_distinct
    from jsonb_array_elements(p_transfers) as elem;
  if v_valid_ids <> v_distinct then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  -- sender 잔고 — 반드시 동일 길드 ledger 만 합산.
  select coalesce(sum(delta), 0) into v_balance
    from point_ledger
   where guild_id = p_guild_id
     and discord_id = p_from;
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
         values (p_guild_id, p_from, -v_recipient.amount, 'transfer_out', v_ref,
                 coalesce(v_recipient.memo, v_recipient.username));
    insert into point_ledger (guild_id, discord_id, delta, reason, ref_id, memo)
         values (p_guild_id, v_recipient.discord_id, v_recipient.amount, 'transfer_in', v_ref,
                 coalesce(v_recipient.memo, v_recipient.username));
  end loop;

  return v_ref;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 4) 멘헤라 tenant 의 알비온 길드명 backfill.
--
-- killboard-sync / verifyDeathInWindow 가 지금까지 ALBION_GUILD_NAME='Menhera'
-- 환경변수로 매칭해왔다. 신규 tenant 도 자기 길드명으로 매칭되려면 per-tenant
-- 키가 필요. 본 마이그는 기존 멘헤라 tenant 만 backfill 하고, 신규 tenant 는
-- 위저드 step 2 에서 albion_home_guild_id 와 함께 albion_home_guild_name 을
-- 저장하도록 코드 변경 (별도 PR).
--
-- app_settings PK 는 (guild_id, key) 복합. on conflict 로 idempotent.
-- ────────────────────────────────────────────────────────────
insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'albion_home_guild_name', 'Menhera', now()
  from public.tenants t
 where t.slug = 'menhera'
on conflict (guild_id, key) do nothing;

-- ────────────────────────────────────────────────────────────
-- Drop prior signatures so stale callers fail loudly instead of silently
-- routing to the old, tenant-leaking versions.
-- ────────────────────────────────────────────────────────────
drop function if exists public.approve_shop_order(uuid, text, text);
drop function if exists public.reject_shop_order(uuid, text, text);
drop function if exists public.transfer_points(text, jsonb);
