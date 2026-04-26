-- 이벤트 단위 일괄 포인트 지급 기능.
--
-- 종료된 이벤트의 참여자(슬롯 배정자)에게 관리자가 일괄 보상을 지급할 수 있다.
-- 단, 다른 보상 흐름(리기어/기부/환전)과 마찬가지로 마지막 단계는 관리자
-- 승인을 거쳐야 실제로 point_ledger 에 적립된다.
--
--   - 발의자(생성)         created_by, created_by_username
--   - 처리자(승인/거절)     handled_by, handled_by_username
--   - 두 사람이 다를 수 있음 (셀프 승인은 정책상 막지 않으나 감사 로그로 추적)
--
-- 참여자 명단은 요청 생성 시점에 스냅샷한다 — 이후 슬롯이 변경돼도 지급 대상은
-- 동결된다. participants jsonb 는 [{discord_id, username}, ...] 형식.
--
-- point_ledger reason: 'event_payout_approved' (+).

-- 1) reason CHECK 확장 — 기존 6 종 + event_payout_approved
alter table point_ledger drop constraint if exists point_ledger_reason_check;
alter table point_ledger
  add constraint point_ledger_reason_check
  check (reason in (
    'regear_approved',
    'exchange_paid',
    'admin_adjust',
    'transfer_in',
    'transfer_out',
    'donation_approved',
    'event_payout_approved'
  ));

-- 2) 이벤트 보상 요청 테이블
create table event_payout_requests (
  id                  uuid default gen_random_uuid() primary key,
  guild_id            uuid not null,
  event_id            uuid not null references events(id) on delete cascade,
  silver_per_member   integer not null check (silver_per_member > 0),
  participants        jsonb not null default '[]'::jsonb,
  participant_count   integer not null check (participant_count >= 0),
  total_silver        bigint  not null check (total_silver >= 0),
  memo                text,
  status              text not null default 'pending'
                      check (status in ('pending','approved','rejected')),
  admin_notes         text,
  created_by          text not null,
  created_by_username text not null,
  handled_by          text,
  handled_by_username text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create index event_payout_requests_guild_status_created
  on event_payout_requests (guild_id, status, created_at desc);
create index event_payout_requests_event
  on event_payout_requests (guild_id, event_id);

alter table event_payout_requests enable row level security;
-- service-role 만 읽기/쓰기 — 다른 보상 테이블과 동일 정책 (RLS baseline 087).

-- 3) 승인 RPC: 상태 flip + 명단 전원에 대해 ledger 적립을 한 트랜잭션으로 처리.
--    `for update` 로 중복 승인 방지. participants 의 각 entry 에 대해 해당
--    discord_id 로 +silver_per_member 을 적립한다 (한 사람이 여러 슬롯에 배정
--    돼도 명단에는 unique 하게 들어가도록 server action 에서 미리 dedupe).
create or replace function public.approve_event_payout_request(
  p_id uuid,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
declare
  v_silver_per_member integer;
  v_participants      jsonb;
  v_member            jsonb;
  v_member_discord    text;
begin
  select silver_per_member, participants
    into v_silver_per_member, v_participants
    from event_payout_requests
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending'
   for update;

  if v_silver_per_member is null then
    raise exception 'EVENT_PAYOUT_NOT_PENDING';
  end if;

  update event_payout_requests
     set status = 'approved',
         resolved_at = now(),
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id;

  for v_member in select * from jsonb_array_elements(v_participants)
  loop
    v_member_discord := v_member->>'discord_id';
    if v_member_discord is null or length(v_member_discord) = 0 then
      continue;
    end if;
    insert into point_ledger (guild_id, discord_id, delta, reason, ref_id)
         values (p_guild_id, v_member_discord, v_silver_per_member,
                 'event_payout_approved', p_id);
  end loop;
end;
$$;

create or replace function public.reject_event_payout_request(
  p_id uuid,
  p_notes text,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
begin
  update event_payout_requests
     set status = 'rejected',
         resolved_at = now(),
         admin_notes = p_notes,
         handled_by = p_admin_id,
         handled_by_username = p_admin_username
   where id = p_id
     and guild_id = p_guild_id
     and status = 'pending';

  if not found then
    raise exception 'EVENT_PAYOUT_NOT_PENDING';
  end if;
end;
$$;
