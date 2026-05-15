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
