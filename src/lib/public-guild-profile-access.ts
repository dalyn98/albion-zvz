export type PublicGuildProfileAccessState =
  | 'missing'
  | 'pending'
  | 'private'
  | 'public'

// 본문·metadata가 같은 상태 해석을 공유한다. active 이외의 운영 상태는 공개
// 프로필 surface 로 나오지 않으며, pending 은 온보딩 안내 전용, enabled=false 는
// 본인 관리자 외 404 전용 private 상태다.
export function resolvePublicGuildProfileAccessState(
  tenantStatus: string | null | undefined,
  profileEnabled: boolean,
): PublicGuildProfileAccessState {
  if (tenantStatus === 'pending') return 'pending'
  if (tenantStatus !== 'active') return 'missing'
  return profileEnabled ? 'public' : 'private'
}
