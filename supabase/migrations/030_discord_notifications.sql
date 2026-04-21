-- 알림 전송 방식을 Web Push 에서 Discord DM 으로 전환.
--
-- 배경: VAPID 설정/브라우저 권한/SW 등록 등 웹 푸시 스택이 운영 부담 대비
-- 수령률이 낮았다. 길드원 전원이 Discord 계정으로 로그인하므로 Discord DM
-- 으로 가면 개인 토글 외에 별도 구독 절차가 필요 없다.
--
-- 변경점:
--   1. push_subscriptions 테이블과 그 인덱스를 드랍한다. 마이그 029 에서
--      생성한 모든 구조물 제거.
--   2. guild_avatars / guests 에 discord_dm_enabled 를 추가 — 개인별 on/off.
--      기본 true (옵트아웃). `/me/settings` 에서 토글한다.
--   3. events.notify_role_id 를 추가 — 이벤트 생성 시 관리자가 고른 Discord
--      역할 ID (@everyone 대신 특정 역할만 태그). NULL 이면 역할 태그 없이
--      채널 메시지만. 0(="@everyone") 은 사용하지 않음 — 불필요하면 NULL.
--   4. events.imminent_notified_at 은 유지 — 전송 수단이 DM 으로 바뀌어도
--      "이벤트당 한 번 발송" 불변식을 여전히 이 컬럼으로 지킨다.

DROP INDEX IF EXISTS push_subscriptions_discord_id_idx;
DROP TABLE IF EXISTS push_subscriptions;

ALTER TABLE guild_avatars
  ADD COLUMN IF NOT EXISTS discord_dm_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS discord_dm_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS notify_role_id text;
