import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IMPERSONATION_TTL_SECONDS,
  signImpersonation,
  verifyImpersonation,
} from '@/lib/super-admin-impersonation-token'

const TENANT_ID = '123e4567-e89b-42d3-a456-426614174000'

beforeEach(() => {
  vi.stubEnv('COOKIE_SECRET', 'test-only-cookie-secret-that-is-long-enough')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('support-view impersonation token', () => {
  it('round-trips a signed tenant with a bounded start time', async () => {
    const token = await signImpersonation(TENANT_ID)

    await expect(verifyImpersonation(token)).resolves.toEqual({
      tenantId: TENANT_ID,
      startedAt: Date.now(),
    })
  })

  it('rejects tampered, expired, and future-dated tokens', async () => {
    const token = await signImpersonation(TENANT_ID)
    const [payload, signature] = token.split('.')

    await expect(verifyImpersonation(`${payload}x.${signature}`)).resolves.toBeNull()

    vi.setSystemTime(
      new Date(Date.now() + (IMPERSONATION_TTL_SECONDS + 1) * 1000),
    )
    await expect(verifyImpersonation(token)).resolves.toBeNull()

    vi.setSystemTime(new Date('2026-08-01T23:59:59.999Z'))
    await expect(verifyImpersonation(token)).resolves.toBeNull()
  })

  it('rejects malformed tenant identifiers before signing', async () => {
    await expect(signImpersonation('not-a-tenant')).rejects.toThrow('invalid tenantId')
  })
})
