import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { SessionPayload } from './session'

// next/navigation.redirect 는 실제 호출 시 throw — 모킹하여 호출 여부만 추적.
const redirectMock = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

const getSessionMock = vi.fn<() => Promise<SessionPayload | null>>()
vi.mock('@/lib/session', async () => {
  const actual = await vi.importActual<typeof import('./session')>('./session')
  return {
    ...actual,
    getSession: () => getSessionMock(),
  }
})

import {
  getSuperAdminSession,
  isSuperAdmin,
  isSuperAdminSession,
  requireSuperAdmin,
} from './super-admin'

function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    discordId: '111',
    username: 'tester',
    avatar: null,
    isMember: true,
    isAdmin: false,
    isGuest: false,
    canCreateEvents: false,
    eventCreatorCategories: [],
    eventScope: null,
    guildId: 'tenant-uuid',
    capabilities: '0',
    issuedAt: Date.now(),
    ...overrides,
  }
}

beforeEach(() => {
  redirectMock.mockClear()
  getSessionMock.mockReset()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isSuperAdmin', () => {
  it('returns false for null / undefined / empty string', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111,222')
    expect(isSuperAdmin(null)).toBe(false)
    expect(isSuperAdmin(undefined)).toBe(false)
    expect(isSuperAdmin('')).toBe(false)
  })

  it('returns false when env var is missing', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '')
    expect(isSuperAdmin('111')).toBe(false)
  })

  it('returns true for IDs listed in the env var', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111,222,333')
    expect(isSuperAdmin('111')).toBe(true)
    expect(isSuperAdmin('222')).toBe(true)
    expect(isSuperAdmin('333')).toBe(true)
  })

  it('returns false for IDs not in the env var', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111,222')
    expect(isSuperAdmin('999')).toBe(false)
    expect(isSuperAdmin('11')).toBe(false) // substring 매칭 안 됨
    expect(isSuperAdmin('1111')).toBe(false) // prefix 매칭 안 됨
  })

  it('trims whitespace around each ID', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '  111  ,  222 ,333')
    expect(isSuperAdmin('111')).toBe(true)
    expect(isSuperAdmin('222')).toBe(true)
    expect(isSuperAdmin('333')).toBe(true)
  })

  it('ignores empty entries (",,,," / trailing commas)', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', ',,,,')
    expect(isSuperAdmin('')).toBe(false)
    expect(isSuperAdmin('any')).toBe(false)
  })

  it('handles a single-entry env var (no comma)', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    expect(isSuperAdmin('111')).toBe(true)
    expect(isSuperAdmin('222')).toBe(false)
  })

  it('re-reads env on each call (lazy loading, hot reload-friendly)', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    expect(isSuperAdmin('222')).toBe(false)
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111,222')
    expect(isSuperAdmin('222')).toBe(true)
  })
})

describe('isSuperAdminSession', () => {
  it('returns false for null / undefined sessions', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    expect(isSuperAdminSession(null)).toBe(false)
    expect(isSuperAdminSession(undefined)).toBe(false)
  })

  it('returns true when session.discordId is in the env var', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111,222')
    expect(isSuperAdminSession(makeSession({ discordId: '111' }))).toBe(true)
  })

  it('returns false when session.discordId is not in the env var', () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    expect(isSuperAdminSession(makeSession({ discordId: '999' }))).toBe(false)
  })

  it('returns false for sessions with admin flag but no super-admin entry', () => {
    // admin 권한이 있어도 SUPER_ADMIN_DISCORD_IDS 에 없으면 슈퍼어드민 아님.
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    expect(
      isSuperAdminSession(makeSession({ discordId: '222', isAdmin: true })),
    ).toBe(false)
  })
})

describe('requireSuperAdmin', () => {
  it('returns the session when caller is a super-admin', async () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    const session = makeSession({ discordId: '111' })
    getSessionMock.mockResolvedValueOnce(session)
    const result = await requireSuperAdmin()
    expect(result).toBe(session)
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('redirects to / when caller is NOT logged in', async () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    getSessionMock.mockResolvedValueOnce(null)
    await expect(requireSuperAdmin()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('redirects to / (not /admin) when caller is logged in but not super-admin', async () => {
    // /super-admin 의 존재 자체를 노출하지 않기 위해 루트로 보낸다.
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    getSessionMock.mockResolvedValueOnce(makeSession({ discordId: '999' }))
    await expect(requireSuperAdmin()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('redirects when env var is missing entirely', async () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '')
    getSessionMock.mockResolvedValueOnce(makeSession({ discordId: '111' }))
    await expect(requireSuperAdmin()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('redirects when session has admin=true but discord_id is not super-admin', async () => {
    // 권한 경계 핵심: 일반 admin 이 슈퍼어드민 페이지로 escalate 시도 시 차단.
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    getSessionMock.mockResolvedValueOnce(
      makeSession({ discordId: '999', isAdmin: true }),
    )
    await expect(requireSuperAdmin()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith('/')
  })
})

describe('getSuperAdminSession', () => {
  it('returns the session for API callers that are super-admins', async () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    const session = makeSession({ discordId: '111' })
    getSessionMock.mockResolvedValueOnce(session)
    await expect(getSuperAdminSession()).resolves.toBe(session)
  })

  it('returns null instead of redirecting for non-super-admin API callers', async () => {
    vi.stubEnv('SUPER_ADMIN_DISCORD_IDS', '111')
    getSessionMock.mockResolvedValueOnce(makeSession({ discordId: '999', isAdmin: true }))
    await expect(getSuperAdminSession()).resolves.toBeNull()
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
