import { describe, expect, it } from 'vitest'
import {
  normalizeSuperAdminUserSearchQuery,
  SUPER_ADMIN_USER_SEARCH_MAX_LENGTH,
  toIlikeContainsPattern,
} from './super-admin-user-search-utils'

describe('super admin user search utils', () => {
  it('normalizes account search query boundaries', () => {
    expect(normalizeSuperAdminUserSearchQuery('  Viorla  ')).toEqual({
      ok: true,
      query: 'Viorla',
    })
    expect(normalizeSuperAdminUserSearchQuery(' a ')).toEqual({
      ok: false,
      error: '검색어는 2자 이상 입력하세요.',
    })
    expect(normalizeSuperAdminUserSearchQuery('a'.repeat(SUPER_ADMIN_USER_SEARCH_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: '검색어는 64자 이하로 입력하세요.',
    })
  })

  it('escapes LIKE wildcards before building contains pattern', () => {
    expect(toIlikeContainsPattern('viorla')).toBe('%viorla%')
    expect(toIlikeContainsPattern('vi%or_la\\east')).toBe('%vi\\%or\\_la\\\\east%')
  })
})
