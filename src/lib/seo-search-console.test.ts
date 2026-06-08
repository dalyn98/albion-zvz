import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSearchAnalyticsRequest,
  getSearchConsoleConfigStatus,
  getSearchConsoleSyncWindow,
  mapSearchConsolePageRows,
  mapSearchConsoleQueryRows,
  normalizeSearchConsolePageUrl,
  selectIndexInspectionTargets,
} from './seo-search-console'

describe('seo search console helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports missing Google Search Console configuration without throwing', () => {
    const status = getSearchConsoleConfigStatus({})

    expect(status).toEqual({
      configured: false,
      siteUrl: null,
      missing: [
        'GOOGLE_SEARCH_CONSOLE_SITE_URL',
        'GOOGLE_OAUTH_CLIENT_ID',
        'GOOGLE_OAUTH_CLIENT_SECRET',
        'GOOGLE_OAUTH_REFRESH_TOKEN',
      ],
    })
  })

  it('builds finalized Search Analytics requests with bounded pagination', () => {
    expect(
      buildSearchAnalyticsRequest({
        startDate: '2026-05-09',
        endDate: '2026-06-05',
        dimensions: ['date', 'page', 'query', 'country', 'device'],
        startRow: 25000,
      }),
    ).toEqual({
      startDate: '2026-05-09',
      endDate: '2026-06-05',
      dimensions: ['date', 'page', 'query', 'country', 'device'],
      type: 'web',
      aggregationType: 'byPage',
      rowLimit: 25000,
      startRow: 25000,
      dataState: 'final',
    })
  })

  it('uses a conservative D-30 through D-3 sync window', () => {
    expect(getSearchConsoleSyncWindow(new Date('2026-06-08T12:00:00.000Z'))).toEqual({
      startDate: '2026-05-09',
      endDate: '2026-06-05',
    })
  })

  it('normalizes canonical feature page URLs and rejects external pages', () => {
    expect(
      normalizeSearchConsolePageUrl(
        'https://albion-guildmanager.com/en/features/auto-regear?utm_source=google',
      ),
    ).toEqual({
      pagePath: '/en/features/auto-regear',
      locale: 'en',
      featureSlug: 'auto-regear',
    })
    expect(
      normalizeSearchConsolePageUrl('https://www.albion-guildmanager.com/features/guild-shop'),
    ).toEqual({
      pagePath: '/features/guild-shop',
      locale: null,
      featureSlug: 'guild-shop',
    })
    expect(normalizeSearchConsolePageUrl('https://evil.example/features/auto-regear')).toBeNull()
  })

  it('maps Search Analytics rows into page and query metrics', () => {
    const pageRows = mapSearchConsolePageRows([
      {
        keys: ['2026-06-01', 'https://albion-guildmanager.com/en/features/auto-regear'],
        clicks: 7,
        impressions: 70,
        ctr: 0.1,
        position: 4.25,
      },
      {
        keys: ['2026-06-01', 'https://evil.example/en/features/auto-regear'],
        clicks: 99,
        impressions: 99,
        ctr: 1,
        position: 1,
      },
    ])

    expect(pageRows).toEqual([
      {
        date: '2026-06-01',
        pagePath: '/en/features/auto-regear',
        locale: 'en',
        featureSlug: 'auto-regear',
        clicks: 7,
        impressions: 70,
        ctr: 0.1,
        position: 4.25,
      },
    ])

    expect(
      mapSearchConsoleQueryRows([
        {
          keys: [
            '2026-06-01',
            'https://albion-guildmanager.com/en/features/auto-regear',
            'albion\u0000 regear bot',
            'kor',
            'DESKTOP',
          ],
          clicks: 3,
          impressions: 30,
          ctr: 0.1,
          position: 3.5,
        },
      ]),
    ).toEqual([
      {
        date: '2026-06-01',
        pagePath: '/en/features/auto-regear',
        query: 'albion regear bot',
        country: 'kor',
        device: 'desktop',
        locale: 'en',
        featureSlug: 'auto-regear',
        clicks: 3,
        impressions: 30,
        ctr: 0.1,
        position: 3.5,
      },
    ])
  })

  it('keeps URL inspection targets small and focused on core SEO landing pages', () => {
    expect(selectIndexInspectionTargets()).toEqual([
      'https://albion-guildmanager.com/',
      'https://albion-guildmanager.com/features',
      'https://albion-guildmanager.com/en/features',
      'https://albion-guildmanager.com/en/features/discord-bot',
      'https://albion-guildmanager.com/en/features/auto-regear',
      'https://albion-guildmanager.com/en/features/zvz-killboard',
      'https://albion-guildmanager.com/ko/features/auto-regear',
      'https://albion-guildmanager.com/ja/features/auto-regear',
      'https://albion-guildmanager.com/zh/features/auto-regear',
    ])
  })
})
