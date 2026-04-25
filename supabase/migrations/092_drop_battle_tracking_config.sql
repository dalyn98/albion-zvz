-- 전투기록은 어드민 설정 없이 home_guild_id + albion_server 가 설정된 모든
-- tenant 에 대해 자동 수집되도록 변경됐다. battle_tracking_enabled /
-- battle_tracking_sizes 두 키의 app_settings 행은 더 이상 읽히지 않으므로
-- 제거. 새 cron 은 모든 size 카테고리(small/middle/large/zerg) 를 자동 분류해
-- 기록한다.
--
-- 영향: 기존에 enabled=false 였던 tenant 도 다음 cron 부터 자동으로 자기 길드의
-- 전투를 수집하기 시작한다. 의도된 변경(요구사항: "킬로그는 상시로 감시되어야 함").

delete from public.app_settings
  where key in ('battle_tracking_enabled', 'battle_tracking_sizes');
