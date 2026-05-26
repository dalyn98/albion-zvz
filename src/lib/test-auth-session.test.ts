import { describe, expect, it } from 'vitest'
import { CAP, CAPABILITY_PRESETS, parseCapabilities } from '@/lib/permissions'
import {
  TEST_AUTH_PRESET_ROLES,
  buildTestSession,
  isTestAuthRouteEnabled,
  isValidTestAuthSecret,
  parseTestAuthRole,
  sanitizeTestAuthReturnTo,
} from './test-auth-session'

describe('test auth session helpers', () => {
  it('requires explicit enablement and a production-safe secret', () => {
    expect(isTestAuthRouteEnabled({ ENABLE_TEST_AUTH: 'true', TEST_AUTH_SECRET: 'short' })).toBe(false)
    expect(
      isTestAuthRouteEnabled({
        ENABLE_TEST_AUTH: 'true',
        TEST_AUTH_SECRET: '1234567890123456',
        VERCEL_ENV: 'production',
      }),
    ).toBe(false)
    expect(
      isTestAuthRouteEnabled({
        ENABLE_TEST_AUTH: 'true',
        TEST_AUTH_SECRET: '1234567890123456',
        VERCEL_ENV: 'preview',
      }),
    ).toBe(true)
  })

  it('checks the test auth secret without accepting missing values', () => {
    const env = { TEST_AUTH_SECRET: '1234567890123456' }
    expect(isValidTestAuthSecret('1234567890123456', env)).toBe(true)
    expect(isValidTestAuthSecret('wrong-secret-value', env)).toBe(false)
    expect(isValidTestAuthSecret(null, env)).toBe(false)
  })

  it('parses only supported roles', () => {
    expect(parseTestAuthRole('admin')).toBe('admin')
    expect(parseTestAuthRole('bombSquadCaller')).toBe('bombSquadCaller')
    expect(parseTestAuthRole('localGuildAccount')).toBe('localGuildAccount')
    expect(parseTestAuthRole('logOfficer')).toBe('logOfficer')
    expect(parseTestAuthRole('owner')).toBeNull()
    expect(parseTestAuthRole(null)).toBeNull()
  })

  it('keeps return paths relative to the current host', () => {
    expect(sanitizeTestAuthReturnTo('/admin/dashboard')).toBe('/admin/dashboard')
    expect(sanitizeTestAuthReturnTo('//evil.test')).toBe('/')
    expect(sanitizeTestAuthReturnTo('https://evil.test')).toBe('/')
    expect(sanitizeTestAuthReturnTo(undefined)).toBe('/')
  })

  it('builds an admin session with full admin flags', () => {
    const session = buildTestSession({ role: 'admin', guildId: 'tenant-1' })
    expect(session.isMember).toBe(true)
    expect(session.isAdmin).toBe(true)
    expect(session.isGuest).toBe(false)
    expect(session.guildId).toBe('tenant-1')
    expect(parseCapabilities(session.capabilities)).toBeGreaterThan(0n)
  })

  it('builds a local guild account session without admin capabilities', () => {
    const session = buildTestSession({
      role: 'localGuildAccount',
      guildId: 'tenant-1',
      username: 'AlbionTester',
    })
    expect(session.username).toBe('AlbionTester')
    expect(session.isMember).toBe(true)
    expect(session.isLocalGuildAccount).toBe(true)
    expect(session.capabilities).toBe('0')
  })

  it('builds an event creator session with event capabilities only', () => {
    const session = buildTestSession({ role: 'eventCreator', guildId: 'tenant-1' })
    const bits = parseCapabilities(session.capabilities)
    expect(session.isAdmin).toBe(false)
    expect(session.canCreateEvents).toBe(true)
    expect((bits & CAP.EVENT_CREATE_COMBAT) !== 0n).toBe(true)
    expect((bits & CAP.SETTINGS_GENERAL) !== 0n).toBe(false)
  })

  it('keeps test auth preset roles aligned with capability presets', () => {
    expect([...TEST_AUTH_PRESET_ROLES]).toEqual(
      CAPABILITY_PRESETS.map((preset) => preset.key),
    )

    for (const preset of CAPABILITY_PRESETS) {
      const session = buildTestSession({ role: preset.key, guildId: 'tenant-1' })
      expect(parseCapabilities(session.capabilities)).toBeGreaterThan(0n)
    }
  })

  it('builds a log officer session for log operation QA', () => {
    const session = buildTestSession({ role: 'logOfficer', guildId: 'tenant-1' })
    const bits = parseCapabilities(session.capabilities)

    expect(session.isAdmin).toBe(false)
    expect(session.isMember).toBe(true)
    expect((bits & CAP.CHEST_LOG_PASTE) !== 0n).toBe(true)
    expect((bits & CAP.SIPHON_MANAGE) !== 0n).toBe(true)
    expect((bits & CAP.AUDIT_VIEW) !== 0n).toBe(true)
    expect((bits & CAP.SETTINGS_PERMISSIONS) !== 0n).toBe(false)
  })

  it('builds a guest session scoped to one event', () => {
    const session = buildTestSession({
      role: 'guest',
      guildId: 'tenant-1',
      eventScope: 'event-1',
    })
    expect(session.isMember).toBe(false)
    expect(session.isGuest).toBe(true)
    expect(session.eventScope).toBe('event-1')
    expect(session.guildId).toBe('tenant-1')
  })

  it('builds a bomb squad caller session without member capabilities', () => {
    const session = buildTestSession({ role: 'bombSquadCaller', guildId: 'tenant-1' })
    expect(session.isMember).toBe(false)
    expect(session.isGuest).toBe(false)
    expect(session.isBombSquadCaller).toBe(true)
    expect(session.capabilities).toBe('0')
  })
})
