// `/super-admin` 라우트의 외부(URL 바) 경로. SUPER_ADMIN_PATH env 가 설정되면
// 그 값이 외부 path 가 되고, proxy 가 직접 `/super-admin` 접근을 404 처리한다.
// 단일 운영자 라우트라 노출 표면을 줄이는 defense-in-depth — 인증 자체는
// 여전히 isSuperAdminSession 이 책임지며 path 는 비밀이 아니다.
//
// Edge runtime 안전: Node-only API 를 import 하지 않는다 (proxy 에서 사용).

export const SUPER_ADMIN_INTERNAL_PATH = '/super-admin'

export function getSuperAdminPath(): string {
  const raw = (process.env.SUPER_ADMIN_PATH ?? '').trim()
  if (!raw) return SUPER_ADMIN_INTERNAL_PATH
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  const stripped = withSlash.replace(/\/+$/, '')
  return stripped || SUPER_ADMIN_INTERNAL_PATH
}

export function isSuperAdminPathRandomized(): boolean {
  return getSuperAdminPath() !== SUPER_ADMIN_INTERNAL_PATH
}
