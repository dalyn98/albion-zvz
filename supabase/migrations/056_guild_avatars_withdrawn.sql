-- 길드원 탈퇴 플래그. NULL = 활동 회원, 값 설정 = 탈퇴 (디스코드 서버에서
-- 빠졌거나 활동 역할을 잃음). 레코드 자체는 남겨 point_ledger / killboard_events
-- 등의 외부 참조가 username 을 그대로 해석할 수 있게 한다. 리스트/집계 쿼리만
-- 이 컬럼으로 필터링.
--
-- cron /api/cron/member-sync 가 매일 1회 이 값을 갱신. 재가입 감지 시 NULL 로
-- 자동 복구되므로 관리자가 수동으로 손 댈 필요는 없다.

alter table public.guild_avatars
  add column if not exists withdrawn_at timestamptz;

-- "탈퇴한 사용자" 통계 섹션과 집계 쿼리 양쪽에서 쓰이는 부분 인덱스. 활동 회원
-- 은 이미 updated_at_idx 로 충분하므로 탈퇴 행만 인덱스한다.
create index if not exists guild_avatars_withdrawn_idx
  on public.guild_avatars (withdrawn_at) where withdrawn_at is not null;
