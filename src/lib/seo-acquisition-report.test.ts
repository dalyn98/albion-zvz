import { describe, expect, it } from 'vitest'
import { summarizeSeoAcquisitionReport } from './seo-acquisition-report'

describe('seo acquisition report summary', () => {
  it('summarizes sessions, clicks, starts, and tenant acquisitions by locale and feature', () => {
    const report = summarizeSeoAcquisitionReport({
      sessions: [
        {
          id: 'session-1',
          firstLandingPath: '/en/features/auto-regear',
          firstLocale: 'en',
          firstFeatureSlug: 'auto-regear',
          firstSource: 'google',
          createdAt: '2026-06-08T00:00:00.000Z',
        },
        {
          id: 'session-2',
          firstLandingPath: '/features/guild-shop',
          firstLocale: null,
          firstFeatureSlug: 'guild-shop',
          firstSource: 'direct',
          createdAt: '2026-06-08T01:00:00.000Z',
        },
      ],
      events: [
        {
          id: 'event-1',
          seoSessionId: 'session-1',
          eventType: 'cta_demo_click',
          path: '/en/features/auto-regear',
          locale: 'en',
          featureSlug: 'auto-regear',
          target: '/demo',
          createdAt: '2026-06-08T00:05:00.000Z',
        },
        {
          id: 'event-2',
          seoSessionId: 'session-1',
          eventType: 'discord_oauth_start',
          path: '/en/features/auto-regear',
          locale: 'en',
          featureSlug: 'auto-regear',
          target: '/api/auth/discord/start',
          createdAt: '2026-06-08T00:06:00.000Z',
        },
        {
          id: 'event-3',
          seoSessionId: 'session-2',
          eventType: 'bot_install_start',
          path: '/features/guild-shop',
          locale: null,
          featureSlug: 'guild-shop',
          target: '/invite',
          createdAt: '2026-06-08T01:10:00.000Z',
        },
      ],
      acquisitions: [
        {
          tenantId: 'tenant-1',
          seoSessionId: 'session-1',
          firstLandingPath: '/en/features/auto-regear',
          firstLocale: 'en',
          firstFeatureSlug: 'auto-regear',
          firstSource: 'google',
          capturedAt: '2026-06-08T00:20:00.000Z',
        },
      ],
    })

    expect(report.totals).toEqual({
      sessions: 2,
      ctaClickSessions: 1,
      discordStartSessions: 1,
      botInstallStartSessions: 1,
      acquiredTenants: 1,
    })
    expect(report.byLocale).toContainEqual({
      key: 'en',
      sessions: 1,
      ctaClickSessions: 1,
      acquiredTenants: 1,
    })
    expect(report.byFeature).toContainEqual({
      key: 'auto-regear',
      sessions: 1,
      ctaClickSessions: 1,
      acquiredTenants: 1,
    })
  })
})
