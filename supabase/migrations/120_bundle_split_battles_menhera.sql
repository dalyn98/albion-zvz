-- 매치업 분리 row 들을 통계/업적의 "전투 카운트" 류 메트릭에서 albion_battle_id
-- 단위로 묶어 1전투로 계산하는 토글. 기본 'false' (분리 카운트, legacy) 이고
-- 멘헤라만 'true' 로 켜서 검증한다. 검증 후 사용자가 명시적으로 "전체 테넌트
-- 적용" 을 지시하면 그때 default 변경 또는 일괄 ON.
--
-- /battles 목록 표시는 영향 없음 — 어디까지나 카운트 메트릭에만 적용.
-- K/D/Fame 은 그룹 합산, outcome 은 main_opponent (가장 큰 force) 매치업 row 의
-- outcome 채택, low-engagement 컷은 그룹 합산값으로 재평가.
insert into public.app_settings (guild_id, key, value)
select t.id, 'bundle_split_battles_in_stats', 'true'
  from public.tenants t
 where t.slug = 'menhera'
on conflict (guild_id, key) do update set value = excluded.value, updated_at = now();
