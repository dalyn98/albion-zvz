-- 147: 통계 매치업 분리 row 묶기 토글 — 전체 active 테넌트로 일반화 (mig 120
-- 후속).
--
-- 배경
--   mig 120 에서 홈 길드(menhera) 만 'true' 로 시드해서 검증. 1주 안정 확인.
--   /battles 목록 표시는 영향 없고 K/D/Fame/카운트 메트릭만 albion_battle_id
--   단위로 그룹 합산하도록 변경된다 (matchup-split row 가 1전투로 묶임).
--
--   `getAppSetting('bundle_split_battles_in_stats', 'false', guildId)` 으로
--   다른 테넌트는 OFF 상태 (= 분리 row 마다 카운트) 였지만, 매치업 분리
--   row 의 중복 카운트는 모든 테넌트에 동등하게 영향을 미치므로 일괄 ON
--   으로 정합성 회복.
--
-- 안전 가드
--   - on conflict do nothing — 이미 행이 있는 테넌트 (멘헤라 'true' 또는
--     혹시 SQL 직접 실행으로 'false' 둔 케이스) 의 의도를 보존하고,
--     행 자체가 없는 활성 테넌트만 신규로 'true' 시드.
--   - 활성 테넌트만 대상. 정지/삭제/대기 테넌트 제외.
--   - 멘헤라는 이미 'true' 이므로 영향 없음 (행 보존).
--
-- 영향 surface
--   - /admin/dashboard 통계 카드, 멤버 본인 페이지 K/D 합산, 길드 프로필
--     활성화된 테넌트의 통계 표가 다음 페이지 로드부터 그룹 합산값으로
--     표시.
--   - 업적/리더보드 카운트도 동일하게 적용.
--   - 이미 저장된 데이터는 변경 없음 (계산만 달라짐).

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'bundle_split_battles_in_stats', 'true', now()
  from public.tenants t
 where t.status = 'active'
on conflict (guild_id, key) do nothing;
