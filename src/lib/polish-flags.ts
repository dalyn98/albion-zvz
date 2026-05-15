/**
 * UI polish 단계 토글. 사이트 운영자가 디자인 변경분을 검수하는 동안 멘헤라
 * 길드에서만 켜두고, 다른 모든 테넌트는 기존 UI 그대로 유지하기 위한 단계 게이트.
 *
 * 검증이 끝나면 분기를 제거하고 새 디자인을 모든 테넌트의 기본으로 흡수할 것.
 * 그 시점엔 이 파일 자체가 dead-code 가 된다.
 *
 * 멘헤라 staged rollout 은 기존 패턴 (member_dashboard, weekly_stats 등) 과
 * 동일한 의도 — 자체 길드에서 사용자 반응을 받고 안정성 확인 후 확장.
 */

// 리더보드 polish v2 — freshness 칩, 1위 글로우, 카드 hover lift, 행 fade-in,
// empty state 폴리시 묶음. 멘헤라에서만 활성, 그 외 길드는 기존 UI.
export function isLeaderboardPolishV2(tenantSlug: string | null | undefined): boolean {
  return tenantSlug === 'menhera'
}

// 디자인 v2 (게임적 아이덴티티) — 알비온 팔레트 (다크 + 골드 + 양피지 크림 +
// 핏빛), 게임 폰트 (Cinzel/Marcellus), 카드 ornate, glow pulse, 마이크로
// 인터랙션. <html data-design="v2"> 어트리뷰트로 CSS 스코핑 → 다른 길드는 코드만
// 추가될 뿐 비주얼 무영향.
//
// 2026-05-15: 멘헤라 첫 노출 후 디자인 방향 재검토 — 일단 false 로 두고 보강
// 방향이 정해지면 다시 enable. 인프라 (CSS 토큰, data-design 분기, 컴포넌트
// override 슬롯) 는 그대로 살려둔다.
//
// 롤백/재활성: 이 함수 본문만 바꾸면 즉시 전 사용자 반영.
export function isDesignV2(_tenantSlug: string | null | undefined): boolean {
  return false
}

// HTML data-design 어트리뷰트 값 계산. 레이아웃에서 한 번 호출.
export function designVersionAttr(tenantSlug: string | null | undefined): 'v1' | 'v2' {
  return isDesignV2(tenantSlug) ? 'v2' : 'v1'
}
