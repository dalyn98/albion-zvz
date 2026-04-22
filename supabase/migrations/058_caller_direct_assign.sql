-- 콜러 직접 지정: 밤스쿼드 콜러가 본인 파티의 빈 슬롯에 멤버를 바로 넣는다.
-- 기존 assign_slot 은 "본인 신청" 플로우 (bomb squad 면 requested_* 로 들어간
-- 뒤 콜러 승인 필요). 이 RPC 는 반대 방향 — 콜러가 대상 멤버의 참여를 주도한다.
-- 권한 체크는 server action 에서 하므로 (mirrors approve_slot_request), RPC 는
-- 호출자를 신뢰한다.
--
-- 제약:
--   - party.is_bomb_squad = true 에서만 사용 (NOT_BOMB_SQUAD)
--   - 슬롯이 완전히 비어있어야 함 (assigned / requested 둘 다 null)
--     * requested 가 있으면 콜러가 먼저 approve/reject 해야 함 (SLOT_PENDING)
--   - cross-party 중복 배정 방지: 대상 멤버가 같은 이벤트 다른 슬롯에
--     assigned 또는 requested 로 들어있으면 차단 (ALREADY_IN_EVENT)
--   - 기어 픽은 수행하지 않음 — assigned_discord_id / assigned_username 만
--     채운다. 기어는 admin 편집기에서 별도로 채우는 구조.

drop function if exists public.caller_assign_slot(uuid, text, text);

create or replace function public.caller_assign_slot(
  p_slot_id uuid,
  p_discord_id text,
  p_username text
) returns void language plpgsql security definer as $$
declare
  v_event_id uuid;
  v_existing text;
  v_existing_req text;
  v_is_bomb boolean;
begin
  select p.event_id, s.assigned_discord_id, s.requested_discord_id,
         coalesce(p.is_bomb_squad, false)
    into v_event_id, v_existing, v_existing_req, v_is_bomb
    from slots s
    join parties p on p.id = s.party_id
   where s.id = p_slot_id
     for update of s;

  if v_event_id is null then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  if not v_is_bomb then
    raise exception 'NOT_BOMB_SQUAD';
  end if;

  if v_existing is not null then
    raise exception 'SLOT_TAKEN';
  end if;

  if v_existing_req is not null then
    raise exception 'SLOT_PENDING';
  end if;

  -- 동일 (event, user) 중복 지정을 직렬화. assign_slot 과 동일한 키로 락을
  -- 잡아 self-signup vs caller-assign 간 race 도 커버.
  perform pg_advisory_xact_lock(
    hashtextextended(v_event_id::text || ':' || p_discord_id, 0)
  );

  if exists (
    select 1 from slots s
    join parties p on p.id = s.party_id
    where p.event_id = v_event_id
      and (s.assigned_discord_id = p_discord_id or s.requested_discord_id = p_discord_id)
  ) then
    raise exception 'ALREADY_IN_EVENT';
  end if;

  update slots set
    assigned_discord_id = p_discord_id,
    assigned_username   = p_username
  where id = p_slot_id;
end;
$$;
