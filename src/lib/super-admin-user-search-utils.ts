export const SUPER_ADMIN_USER_SEARCH_MIN_LENGTH = 2
export const SUPER_ADMIN_USER_SEARCH_MAX_LENGTH = 64

export type SuperAdminUserSearchNormalizeResult =
  | { ok: true; query: string }
  | { ok: false; error: string }

export function normalizeSuperAdminUserSearchQuery(raw: unknown): SuperAdminUserSearchNormalizeResult {
  const query = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''
  if (query.length < SUPER_ADMIN_USER_SEARCH_MIN_LENGTH) {
    return { ok: false, error: `검색어는 ${SUPER_ADMIN_USER_SEARCH_MIN_LENGTH}자 이상 입력하세요.` }
  }
  if (query.length > SUPER_ADMIN_USER_SEARCH_MAX_LENGTH) {
    return { ok: false, error: `검색어는 ${SUPER_ADMIN_USER_SEARCH_MAX_LENGTH}자 이하로 입력하세요.` }
  }
  return { ok: true, query }
}

export function toIlikeContainsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}
