-- 길드 공개 페이지(`/g/<slug>`) 의 길드원 본인 대시보드 섹션 활성화 토글.
-- 'true' 일 때만 hero 직후에 4 카드 (잔액/킬·데스/리기어 청구/거래) 와 비로그인
-- CTA 배너가 노출된다. 기본 'false' (=미설정) 이며 멘헤라만 'true' 로 켜서
-- 검증. 검증 후 사용자가 명시적으로 전체 테넌트 적용을 지시하면 그때 default
-- 변경 또는 일괄 ON.
--
-- 다른 길드의 공개 페이지 동작은 영향 받지 않는다 — 페이지 코드가 이 토글을
-- 'true' 일 때만 멤버 데이터를 fetch / 렌더하므로 OFF 상태에선 비용 0.
insert into public.app_settings (guild_id, key, value)
select t.id, 'member_dashboard_enabled', 'true'
  from public.tenants t
 where t.slug = 'menhera'
on conflict (guild_id, key) do update set value = excluded.value, updated_at = now();
