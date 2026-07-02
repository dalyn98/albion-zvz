import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import { captureTenantAcquisitionSource } from './seo-attribution'

describe('captureTenantAcquisitionSource', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.logError.mockReset()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('copies the first SEO session touch into a once-only tenant acquisition row', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const maybeSingle = vi.fn(async () => ({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        first_landing_path: '/en/features/auto-regear',
        first_locale: 'en',
        first_feature_slug: 'auto-regear',
        first_referrer_host: 'www.google.com',
        first_source: 'google',
        first_utm: { utm_source: 'google' },
      },
      error: null,
    }))
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn((table: string) => {
      if (table === 'seo_sessions') return { select }
      if (table === 'tenant_acquisition_sources') return { insert }
      throw new Error(`unexpected table ${table}`)
    })
    mocks.getAdminClient.mockReturnValue({ from })

    const result = await captureTenantAcquisitionSource({
      tenantId: '22222222-2222-4222-8222-222222222222',
      visitorId: '00000000-0000-4000-8000-000000000001',
    })

    expect(result).toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('seo_sessions')
    expect(eq).toHaveBeenCalledWith('visitor_id', '00000000-0000-4000-8000-000000000001')
    expect(insert).toHaveBeenCalledWith({
      tenant_id: '22222222-2222-4222-8222-222222222222',
      seo_session_id: '11111111-1111-4111-8111-111111111111',
      first_landing_path: '/en/features/auto-regear',
      first_locale: 'en',
      first_feature_slug: 'auto-regear',
      first_referrer_host: 'www.google.com',
      first_source: 'google',
      first_utm: { utm_source: 'google' },
    })
  })

  it('skips silently when the attribution cookie is missing or malformed', async () => {
    const result = await captureTenantAcquisitionSource({
      tenantId: '22222222-2222-4222-8222-222222222222',
      visitorId: 'not-a-uuid',
    })

    expect(result).toEqual({ ok: true, skipped: true })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })
})
