-- Remove dead app_settings rows for albion_home_alliance_id.
-- 짧게 살았던 alliance-only 전투 추적 기능 (revert 09d862e/bc5fd71) 이 테넌트별로
-- 캐싱해두던 설정 키. 코드에서 더는 읽거나 쓰지 않으므로 inert 한 상태지만,
-- 깔끔히 정리해 둔다.

delete from public.app_settings
where key = 'albion_home_alliance_id';
