-- 이벤트와 무관한 자유 신청 창구. 알비온 전투가 길게 이어지면 그때마다 이벤트
-- (events 행) 를 만드는 게 비현실적이라, 관리자가 "지금부터 ~까지 리기어 받습니다"
-- 식으로 한 번에 윈도우를 열어두면 멤버는 거기에 자유롭게 신청한다.
--
-- 1) regear_windows: 관리자가 여는 신청 창구. 만료 시각, 1인당 최대 데스, 역할
--    리워드는 윈도우 생성 시점의 role_rewards 가 그대로 적용된다 (별도 스냅샷
--    필요 없음 — 자동 리기어 X, 청구자가 부위별 가격 입력하는 manual flow 만 허용).
-- 2) regear_requests.event_id 를 nullable 로 풀고 regear_window_id 컬럼 추가.
--    CHECK 로 정확히 하나만 채워지도록 강제 (자동 리기어는 여전히 event_id 필수).
-- 3) auto_generated 자동 리기어는 윈도우와 무관하다 — create_auto_regear_request
--    는 손대지 않는다.

create table if not exists public.regear_windows (
  id                       uuid primary key default gen_random_uuid(),
  guild_id                 uuid not null references public.tenants(id) on delete cascade,
  title                    text not null,
  description              text,
  max_deaths_per_member    integer not null default 1 check (max_deaths_per_member >= 1),
  opens_at                 timestamptz not null default now(),
  closes_at                timestamptz,
  closed_at                timestamptz,
  closed_by_username       text,
  created_by_discord_id    text,
  created_by_username      text,
  created_at               timestamptz not null default now()
);

create index if not exists regear_windows_guild_open_idx
  on public.regear_windows (guild_id, closed_at, closes_at desc);

-- regear_requests 업데이트: event_id nullable + regear_window_id 추가.
alter table public.regear_requests
  alter column event_id drop not null;

alter table public.regear_requests
  add column if not exists regear_window_id uuid
    references public.regear_windows(id) on delete cascade;

create index if not exists regear_requests_window_idx
  on public.regear_requests (regear_window_id)
  where regear_window_id is not null;

-- 둘 다 SET 되는 것만 차단. 새 행은 application 레벨에서 정확히 하나만 채우는데,
-- 과거 events 삭제 흐름에서 살아남은 legacy 행 (event_id NULL + regear_window_id
-- NULL) 이 이미 존재하므로 strict XOR 로 거는 건 불가. "둘 다 SET 되면 안 됨"
-- 만 DB 가 강제하고 나머지는 코드가 책임.
alter table public.regear_requests
  drop constraint if exists regear_requests_event_xor_window_chk;

alter table public.regear_requests
  add constraint regear_requests_event_xor_window_chk
  check (not (event_id is not null and regear_window_id is not null));

comment on table public.regear_windows is
  '이벤트 외 자유 리기어 신청 창구. 관리자가 열고/닫고, 멤버는 windows 가 열려 있는 동안 manual flow 로 신청.';
comment on column public.regear_requests.regear_window_id is
  'regear_windows.id. 자유 신청 창구로 들어온 행은 event_id NULL + regear_window_id NOT NULL.';
