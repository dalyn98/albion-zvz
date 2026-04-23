-- 059_event_status.sql
--
-- 이벤트 발행 상태 추가. 기존에는 createEvent 단계에서 gather_at 을 필수로 받고
-- 바로 공개됐는데, "빌드부터 짜두고 나중에 날짜 붙여 발행" 워크플로를 위해
-- 'draft' / 'published' 2 단계를 도입한다.
--
-- - draft: 공개 /events 에서 숨김. gather_at 이 비어 있어도 허용. 관리자 대시보드만 노출.
-- - published: 기존 동작과 동일 — 공개 목록, 크론 리마인더, notifyEvent 대상.
--
-- 기존 행은 모두 'published' 로 backfill (이미 공개돼 있었으므로).
-- 새로 만들어지는 행의 기본값은 'draft' — createEvent 는 draft 로 만들고 별도의
-- publishEvent 액션이 상태 전이를 담당.

alter table events
  add column if not exists status text not null default 'draft';

-- 이전에 만들어진 행은 전부 게시돼 있던 상태라고 간주하고 'published' 로 백필.
-- DEFAULT 만 바꾸면 기존 행이 'draft' 가 되어 공개 페이지에서 사라지므로 주의.
update events
  set status = 'published'
  where status = 'draft';

alter table events
  add constraint events_status_check
  check (status in ('draft', 'published')) not valid;

alter table events validate constraint events_status_check;

-- 공개 필터와 대시보드 정렬이 status 를 자주 같이 읽으므로 복합 인덱스.
-- created_at desc 는 대시보드 draft 목록에서 유용.
create index if not exists events_status_created_at_idx
  on events (status, created_at desc);
