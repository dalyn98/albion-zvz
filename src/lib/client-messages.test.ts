import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
  getClientMessagesForPathname,
} from './client-messages'

const SOURCE_ROOTS = ['src/app', 'src/components']
const APP_PROFILE_NAMESPACES = [
  'albionOnboarding',
  'common',
  'errors',
  'memberTour',
  'nav',
  'sidebar',
  'toast',
  'unsavedChanges',
] as const

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(file, out)
      continue
    }
    if (/\.tsx?$/.test(entry.name)) out.push(file)
  }
  return out
}

function usedClientTranslationNamespaces(): Set<string> {
  const namespaces = new Set<string>()
  const namespacePattern = /useTranslations(?:<[^>]+>)?\(\s*(['"])(.*?)\1\s*\)/g
  for (const root of SOURCE_ROOTS) {
    for (const file of walkTsFiles(root)) {
      const source = readFileSync(file, 'utf8')
      if (!/^['"]use client['"]/m.test(source)) continue
      let match: RegExpExecArray | null
      while ((match = namespacePattern.exec(source))) {
        namespaces.add(match[2].split('.')[0])
      }
    }
  }
  return namespaces
}

function messagesFor(namespaces: readonly string[]): Record<string, { label: string }> {
  return Object.fromEntries(
    namespaces.map((namespace) => [namespace, { label: namespace }]),
  )
}

function selectedNamespacesFor(pathname: string, namespaces: readonly string[]): string[] {
  return Object.keys(getClientMessagesForPathname(messagesFor(namespaces), pathname)).sort()
}

describe('getClientMessages', () => {
  it('keeps every namespace referenced by client useTranslations calls', () => {
    const allowed = new Set<string>(CLIENT_MESSAGE_NAMESPACES)
    const missing = [...usedClientTranslationNamespaces()].filter((ns) => !allowed.has(ns))

    expect(missing).toEqual([])
  })

  it('filters server-only message namespaces out of the provider payload', () => {
    const messages = {
      common: { save: 'save' },
      nav: { home: 'home' },
      adminGuide: { huge: 'server only' },
      adminActionError: { serverError: 'server only' },
    }

    expect(getClientMessages(messages)).toEqual({
      common: { save: 'save' },
      nav: { home: 'home' },
    })
  })

  it('uses a small message profile for the public shop page', () => {
    const messages = {
      common: { save: 'save' },
      nav: { shop: 'shop' },
      sidebar: { login: 'login' },
      shop: { title: 'shop' },
      shopCatalog: { title: 'catalog' },
      shopMyOrders: { title: 'orders' },
      adminDashboard: { huge: 'admin only' },
      members: { huge: 'members only' },
      regear: { huge: 'regear only' },
    }

    expect(getClientMessagesForPathname(messages, '/shop')).toEqual({
      common: { save: 'save' },
      nav: { shop: 'shop' },
      sidebar: { login: 'login' },
      shop: { title: 'shop' },
      shopCatalog: { title: 'catalog' },
      shopMyOrders: { title: 'orders' },
    })
  })

  it('uses a marketing profile without app-only client messages', () => {
    const messages = {
      common: { save: 'save' },
      publicMarketing: { title: 'marketing' },
      publicGuildProfile: { title: 'guild' },
      sidebar: { language: 'language' },
      shopCatalog: { title: 'catalog' },
      adminDashboard: { huge: 'admin only' },
      regear: { huge: 'regear only' },
    }

    expect(getClientMessagesForPathname(messages, '/public/landing')).toEqual({
      common: { save: 'save' },
      publicMarketing: { title: 'marketing' },
      publicGuildProfile: { title: 'guild' },
      sidebar: { language: 'language' },
    })
  })

  it('uses a members profile instead of the full shared payload', () => {
    expect(selectedNamespacesFor('/members?tab=guests', [
      ...APP_PROFILE_NAMESPACES,
      'members',
      'slotRole',
      'adminDashboard',
      'regear',
      'shopCatalog',
    ])).toEqual([
      ...APP_PROFILE_NAMESPACES,
      'members',
      'slotRole',
    ].sort())
  })

  it('uses a regear profile with notice and claim editor messages', () => {
    expect(selectedNamespacesFor('/regear', [
      ...APP_PROFILE_NAMESPACES,
      'adminRegearNotice',
      'gear',
      'noticeBannerAdmin',
      'regear',
      'regearBreakdown',
      'regearBuildSnapshot',
      'regearRejectReason',
      'regearTrackedDeaths',
      'regearWindow',
      'slotRole',
      'adminDashboard',
      'members',
      'shopCatalog',
    ])).toEqual([
      ...APP_PROFILE_NAMESPACES,
      'adminRegearNotice',
      'gear',
      'noticeBannerAdmin',
      'regear',
      'regearBreakdown',
      'regearBuildSnapshot',
      'regearRejectReason',
      'regearTrackedDeaths',
      'regearWindow',
      'slotRole',
    ].sort())
  })

  it('uses a my-page subtree profile for account, request, and settings routes', () => {
    expect(selectedNamespacesFor('/me/settings', [
      ...APP_PROFILE_NAMESPACES,
      'adminTimezone',
      'craftPickup',
      'discordDm',
      'donation',
      'exchangeActions',
      'languageSetting',
      'me',
      'memberActionError',
      'myRequests',
      'myTimezone',
      'requestExchange',
      'regearBreakdown',
      'regearRejectReason',
      'adminDashboard',
      'members',
      'shopCatalog',
    ])).toEqual([
      ...APP_PROFILE_NAMESPACES,
      'adminTimezone',
      'craftPickup',
      'discordDm',
      'donation',
      'exchangeActions',
      'languageSetting',
      'me',
      'memberActionError',
      'myRequests',
      'myTimezone',
      'requestExchange',
      'regearBreakdown',
      'regearRejectReason',
    ].sort())
  })

  it('uses an event profile for public event details and party editing routes', () => {
    expect(selectedNamespacesFor('/events/event-1/party/1', [
      ...APP_PROFILE_NAMESPACES,
      'adminEditEvent',
      'adminEventPayoutCreate',
      'adminEventsNotice',
      'adminParty',
      'buildSheetRecruitment',
      'demo',
      'event',
      'eventGuestInvite',
      'eventGuestProfile',
      'eventRegearParticipants',
      'eventTentative',
      'eventTentativeAction',
      'gear',
      'noticeBannerAdmin',
      'publishEventBanner',
      'slot',
      'slotRole',
      'adminDashboard',
      'members',
      'shopCatalog',
    ])).toEqual([
      ...APP_PROFILE_NAMESPACES,
      'adminEditEvent',
      'adminEventPayoutCreate',
      'adminEventsNotice',
      'adminParty',
      'buildSheetRecruitment',
      'demo',
      'event',
      'eventGuestInvite',
      'eventGuestProfile',
      'eventRegearParticipants',
      'eventTentative',
      'eventTentativeAction',
      'gear',
      'noticeBannerAdmin',
      'publishEventBanner',
      'slot',
      'slotRole',
    ].sort())
  })
})
