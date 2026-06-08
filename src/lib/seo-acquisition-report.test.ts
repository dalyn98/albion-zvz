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
      searchConsolePages: [
        {
          date: '2026-06-01',
          pagePath: '/en/features/auto-regear',
          locale: 'en',
          featureSlug: 'auto-regear',
          clicks: 10,
          impressions: 100,
          ctr: 0.1,
          position: 4.2,
        },
        {
          date: '2026-06-01',
          pagePath: '/features/guild-shop',
          locale: null,
          featureSlug: 'guild-shop',
          clicks: 2,
          impressions: 40,
          ctr: 0.05,
          position: 9.5,
        },
      ],
      searchConsoleQueries: [
        {
          date: '2026-06-01',
          pagePath: '/en/features/auto-regear',
          query: 'albion regear bot',
          country: 'kor',
          device: 'desktop',
          locale: 'en',
          featureSlug: 'auto-regear',
          clicks: 7,
          impressions: 70,
          ctr: 0.1,
          position: 3.8,
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
    expect(report.searchConsoleTotals).toEqual({
      clicks: 12,
      impressions: 140,
      averageCtr: 0.08571428571428572,
      averagePosition: 5.714285714285714,
    })
    expect(report.landingPages).toContainEqual({
      pagePath: '/en/features/auto-regear',
      locale: 'en',
      featureSlug: 'auto-regear',
      clicks: 10,
      impressions: 100,
      averageCtr: 0.1,
      averagePosition: 4.2,
      sessions: 1,
      ctaClickSessions: 1,
      botInstallStartSessions: 0,
      acquiredTenants: 1,
    })
    expect(report.topQueries).toEqual([
      {
        query: 'albion regear bot',
        pagePath: '/en/features/auto-regear',
        country: 'kor',
        device: 'desktop',
        clicks: 7,
        impressions: 70,
        averageCtr: 0.1,
        averagePosition: 3.8,
      },
    ])
  })
})
