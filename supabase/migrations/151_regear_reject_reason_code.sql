-- 거절 사유를 자유 텍스트(admin_notes) 만으로 받으면
--   1) 통계/필터링 불가 — "킬보드 매칭 안 됨" 이라고 적힐 때마다 새 문자열
--   2) i18n 불가 — 한국어로 적은 사유가 일본/영문 멤버에게 그대로 노출
--   3) 멤버 UX 약화 — 어떤 행동을 해야 재신청이 가능한지 모호
--
-- 이를 해결하기 위해 enum 코드(reject_reason_code) 컬럼을 분리.
-- admin_notes 는 기존대로 free-text 보조 메모로 유지 (관리자가 추가 코멘트를
-- 남기고 싶을 때 사용).
--
-- 정해진 8개 사유:
--   killboard_mismatch    — 킬보드에서 같은 시점/같은 캐릭 사망이 안 잡힘
--   out_of_window         — 이벤트 종료 시간 + 윈도우(기본 60분) 밖에서 사망
--   screenshot_invalid    — 스크린샷이 위조/식별 불가/중복
--   price_inflated        — 청구액이 시세 대비 비정상적으로 과대
--   duplicate_request     — 같은 사망에 대해 이미 다른 신청이 처리됨
--   not_eligible_event    — 이벤트 자체가 적격 아님 (페널티 이벤트 등)
--   insufficient_evidence — 청구자가 요구한 추가 증빙 미제출
--   other                 — 위에 해당 안 됨 (admin_notes 필수 안내)

alter table regear_requests
  add column if not exists reject_reason_code text
    check (
      reject_reason_code is null
      or reject_reason_code in (
        'killboard_mismatch',
        'out_of_window',
        'screenshot_invalid',
        'price_inflated',
        'duplicate_request',
        'not_eligible_event',
        'insufficient_evidence',
        'other'
      )
    );

-- 거절된 row 가 코드 없이 남아있으면 멤버 화면에서 라벨이 비게 됨 — legacy 보호용
-- 으로 기존 거절 건은 'other' 로 마킹. admin_notes 는 그대로 보존되므로 정보 손실 없음.
update regear_requests
   set reject_reason_code = 'other'
 where status = 'rejected'
   and reject_reason_code is null;

-- RPC 시그니처에 p_reason_code 추가. 기존 함수는 인자 수가 달라 drop 후 재정의.
drop function if exists public.reject_regear_request(uuid, text, text, text, uuid);

create or replace function public.reject_regear_request(
  p_id uuid,
  p_notes text,
  p_reason_code text,
  p_admin_id text,
  p_admin_username text,
  p_guild_id uuid
) returns void language plpgsql security definer as $$
begin
  if p_reason_code is null
     or p_reason_code not in (
       'killboard_mismatch',
       'out_of_window',
       'screenshot_invalid',
       'price_inflated',
       'duplicate_request',
       'not_eligible_event',
       'insufficient_evidence',
       'other'
     ) then
    raise exception 'INVALID_REJECT_REASON_CODE';
  end if;

  update regear_requests
     set status = 'rejected',
         resolved_at = now(),
         admin_notes = p_notes,
         reject_reason_code = p_reason_code,
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

-- 통계/필터링용 인덱스. 거절 사유별 집계(예: 슈퍼어드민 대시보드, 멤버 본인의
-- "왜 거절됐는지" 모아보기) 시점에 sequential scan 을 피한다. partial 로
-- rejected 인 row 만 색인해 인덱스 크기를 작게 유지.
create index if not exists regear_requests_reject_reason_code
  on regear_requests (reject_reason_code)
  where status = 'rejected';
