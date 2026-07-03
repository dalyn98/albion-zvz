import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLIENT_SEO_ATTRIBUTION_EVENT_TYPES,
  SEO_ATTRIBUTION_EVENT_TYPES,
  SEO_SESSION_COOKIE,
  captureTenantAcquisitionSource,
  isClientSeoAttributionEventType,
  isSeoAttributionEventType,
  parseSeoAttributionContext,
  recordClientSeoAttributionEvent,
  recordSeoAttributionEventFromRequest,
  sanitizeSeoAttributionTarget,
  sanitizeSeoVisitorId,
  sourceFromReferrer,
} from './seo-attribution'

describe('seo attribution helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('accepts the shared event taxonomy and separates client-trackable events', () => {
    expect(SEO_ATTRIBUTION_EVENT_TYPES).toContain('landing_view')
    expect(SEO_ATTRIBUTION_EVENT_TYPES).toContain('discord_oauth_start')
    expect(SEO_ATTRIBUTION_EVENT_TYPES).toContain('bot_install_start')
    expect(CLIENT_SEO_ATTRIBUTION_EVENT_TYPES).toContain('cta_bot_install_click')
    expect(CLIENT_SEO_ATTRIBUTION_EVENT_TYPES).not.toContain('bot_install_start')
    expect(isSeoAttributionEventType('language_switch')).toBe(true)
    expect(isClientSeoAttributionEventType('bot_install_start')).toBe(false)
  })

  it('parses localized feature URLs without retaining search-query PII', () => {
    const parsed = parseSeoAttributionContext({
      path: '/en/features/auto-regear?utm_source=google&utm_campaign=zvz&q=secret',
      referrer: 'https://www.google.com/search?q=albion+guild+manager',
    })

    expect(parsed).toEqual({
      path: '/en/features/auto-regear',
      locale: 'en',
      featureSlug: 'auto-regear',
      referrerHost: 'www.google.com',
      source: 'utm',
      utm: {
        utm_source: 'google',
        utm_campaign: 'zvz',
      },
    })
  })

  it('parses public marketing URLs beyond feature pages without keeping search noise', () => {
    expect(parseSeoAttributionContext({
      path: '/zvz-battles?min=10&debug=secret',
      referrer: 'https://albion-guildmanager.com/features',
    })).toMatchObject({
      path: '/zvz-battles',
      locale: null,
      featureSlug: null,
      source: 'internal',
      utm: {},
    })
    expect(parseSeoAttributionContext({
      path: '/ja/docs?utm_source=naver',
      referrer: 'https://search.naver.com/search.naver?query=agm',
    })).toMatchObject({
      path: '/ja/docs',
      locale: 'ja',
      featureSlug: null,
      source: 'utm',
      utm: { utm_source: 'naver' },
    })
  })

  it('rejects private or external paths for the public tracking surface', () => {
    expect(parseSeoAttributionContext({ path: '/admin/dashboard', referrer: null })).toBeNull()
    expect(parseSeoAttributionContext({ path: 'https://evil.example/features', referrer: null })).toBeNull()
    expect(parseSeoAttributionContext({ path: '/ja/docs/regear/auto', referrer: null })).toBeNull()
  })

  it('classifies sources from referrer host when no UTM source is present', () => {
    expect(sourceFromReferrer('https://www.google.com/search?q=agm', {})).toBe('google')
    expect(sourceFromReferrer('https://bing.com/search?q=agm', {})).toBe('bing')
    expect(sourceFromReferrer('https://search.naver.com/search.naver?query=agm', {})).toBe('naver')
    expect(sourceFromReferrer('https://albion-guildmanager.com/features', {})).toBe('internal')
    expect(sourceFromReferrer('https://example.com/post', {})).toBe('referral')
    expect(sourceFromReferrer('', {})).toBe('direct')
  })

  it('sanitizes visitor ids and click targets before persistence', () => {
    expect(sanitizeSeoVisitorId('00000000-0000-4000-8000-000000000001')).toBe(
      '00000000-0000-4000-8000-000000000001',
    )
    expect(sanitizeSeoVisitorId('not-a-uuid')).toBeNull()
    expect(sanitizeSeoAttributionTarget('/docs/onboarding/setup-wizard?token=secret#part')).toBe(
      '/docs/onboarding/setup-wizard',
    )
    expect(sanitizeSeoAttributionTarget('https://discord.com/oauth2/authorize?client_id=123')).toBe(
      'https://discord.com/oauth2/authorize',
    )
  })

  it('skips DB-backed recording without admin env while keeping valid tracking responses quiet', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const visitorId = '00000000-0000-4000-8000-000000000001'
    const request = new NextRequest('https://albion-guildmanager.com/features/auto-regear', {
      headers: {
        cookie: `${SEO_SESSION_COOKIE}=${visitorId}`,
        referer: 'https://www.google.com/search?q=agm',
      },
    })

    await expect(
      recordClientSeoAttributionEvent(request, {
        eventType: 'landing_view',
        path: '/features/auto-regear',
      }),
    ).resolves.toEqual({ ok: true, visitorId })
    await expect(
      recordSeoAttributionEventFromRequest(request, {
        eventType: 'discord_oauth_start',
        target: '/api/auth/discord/start',
      }),
    ).resolves.toEqual({ ok: true, skipped: true })
    await expect(
      captureTenantAcquisitionSource({
        tenantId: 'tenant-1',
        visitorId,
      }),
    ).resolves.toEqual({ ok: true, skipped: true })
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
