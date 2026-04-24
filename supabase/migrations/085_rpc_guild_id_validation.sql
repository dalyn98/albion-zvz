-- 085: approve/reject RPC 에 p_guild_id 파라미터 추가 + WHERE 조건 강화.
--
-- 배경: migrations 040/073 에서 각 RPC 는 (p_id, p_admin_id, p_admin_username)
-- 만 받고 row 의 guild_id 를 검증하지 않았다. 같은 UUID 를 알고 있는 타 길드
-- 관리자가 p_id 만으로 다른 길드의 요청을 승인/거절할 수 있는 잠재적 크로스-
-- 테넌트 취약점이 있다. 실제 공격은 UUID 무작위성 때문에 어렵지만, 멀티테넌트
-- SaaS 전환 전에 경계를 데이터베이스 레벨에서 강제하는 편이 안전하다.
--
-- 전략: 각 RPC 에 p_guild_id uuid 인자를 추가하고, 내부 SELECT/UPDATE 쿼리
-- 모두 `and guild_id = p_guild_id` 조건을 건다. 잘못된 guild_id 가 넘어오면
-- 기존 NOT_PENDING 예외와 동일 경로로 실패 — 관리자 UI 는 이미 그 에러를
-- "이미 처리됨" 으로 표시하므로 UX 변화 없음.
--
-- 기존 시그니처는 drop 하여 stale caller 가 조용히 실패하지 않고 에러를 내게.

-- ────────────────────────────────────────────────────────────
-- 1) approve_regear_request
-- ────────────────────────────────────────────────────────────
create or replace function public.approve_regear_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid,
  p_payout_silver integer default null
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_claimed integer;
  v_credit  integer;
begin
  select discord_id, claimed_silver
    into v_discord, v_claimed
    from regear_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
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
   where id = p_id
     and guild_id = p_guild_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (p_guild_id, v_discord, v_credit, 'regear_approved', p_id);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 2) reject_regear_request
-- ────────────────────────────────────────────────────────────
create or replace function public.reject_regear_request(
  p_id uuid,
  p_notes text,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
begin
  update regear_requests
     set status = 'rejected',
         resolved_at = now(),
         admin_notes = p_notes,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending';

  if not found then
    raise exception 'REGEAR_NOT_PENDING';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 3) approve_exchange_request
-- ────────────────────────────────────────────────────────────
create or replace function public.approve_exchange_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_silver  integer;
  v_balance integer;
begin
  select discord_id, silver
    into v_discord, v_silver
    from exchange_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_discord, 0));

  select coalesce(sum(delta), 0) into v_balance
    from point_ledger
   where guild_id = p_guild_id
     and discord_id = v_discord;

  if v_balance < v_silver then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  update exchange_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (p_guild_id, v_discord, -v_silver, 'exchange_paid', p_id);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 4) reject_exchange_request
-- ────────────────────────────────────────────────────────────
create or replace function public.reject_exchange_request(
  p_id uuid,
  p_notes text,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
begin
  update exchange_requests
     set status = 'rejected',
         resolved_at = now(),
         admin_notes = p_notes,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending';

  if not found then
    raise exception 'EXCHANGE_NOT_PENDING';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 5) approve_donation_request
-- ────────────────────────────────────────────────────────────
create or replace function public.approve_donation_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
declare
  v_discord text;
  v_silver  integer;
begin
  select discord_id, silver
    into v_discord, v_silver
    from donation_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_discord is null then
    raise exception 'DONATION_NOT_PENDING';
  end if;

  update donation_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
       values (p_guild_id, v_discord, v_silver, 'donation_approved', p_id);
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 6) reject_donation_request
-- ────────────────────────────────────────────────────────────
create or replace function public.reject_donation_request(
  p_id uuid,
  p_notes text,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
begin
  update donation_requests
     set status = 'rejected',
         resolved_at = now(),
         admin_notes = p_notes,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending';

  if not found then
    raise exception 'DONATION_NOT_PENDING';
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Drop prior signatures so stale callers fail loudly.
-- ────────────────────────────────────────────────────────────
drop function if exists public.approve_regear_request(uuid, text, text);
drop function if exists public.approve_regear_request(uuid, text, text, integer);
drop function if exists public.reject_regear_request(uuid, text, text, text);
drop function if exists public.approve_exchange_request(uuid, text, text);
drop function if exists public.reject_exchange_request(uuid, text, text, text);
drop function if exists public.approve_donation_request(uuid, text, text);
drop function if exists public.reject_donation_request(uuid, text, text, text);
