-- 054 에서 만든 킬로그 기반 배틀 집계 테이블 철거. 다중 길드 SaaS 로 확장할
-- 때 "상대 길드" 개념을 함께 설계해 재도입 예정. 현재 단일 길드 운영에선
-- 규칙이 지나치게 복잡해 되돌린다. 테이블이 비어있을 때 drop 하므로 데이터
-- 손실은 없다.

drop table if exists public.battle_kill_snapshots;
drop table if exists public.battle_participants;
drop table if exists public.battles;

-- 배틀 임계값 설정도 같이 정리. 다시 만들 때 기본값 설계를 새로 가져가면
-- 되므로 남겨둘 가치가 없다.
delete from public.app_settings
 where key in ('battle_window_hours', 'battle_min_total_players', 'battle_min_guild_players');
