import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  CLIENT_MESSAGE_NAMESPACES,
  getClientMessages,
  getClientMessagesForPathname,
} from './client-messages'

const SOURCE_ROOTS = ['src/app', 'src/components']
const SOURCE_IMPORT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const
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

function resolveSourceImport(specifier: string, importer: string): string | null {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
  const base = specifier.startsWith('@/')
    ? join('src', specifier.slice(2))
    : resolve(dirname(importer), specifier)
  const candidates = [
    base,
    ...SOURCE_IMPORT_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_IMPORT_EXTENSIONS.map((extension) => join(base, `index${extension}`)),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

function importedSourceFiles(startFiles: readonly string[]): string[] {
  const seen = new Set<string>()
  const stack = [...startFiles]
  const importPattern =
    /import\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g

  while (stack.length > 0) {
    const file = stack.pop()
    if (!file || seen.has(file) || !existsSync(file)) continue
    seen.add(file)

    const source = readFileSync(file, 'utf8')
    let match: RegExpExecArray | null
    while ((match = importPattern.exec(source))) {
      const imported = resolveSourceImport(match[1], file)
      if (imported && !seen.has(imported)) stack.push(imported)
    }
  }

  return [...seen]
}

function usedClientTranslationNamespacesFromFiles(files: readonly string[]): Set<string> {
  const namespaces = new Set<string>()
  const namespacePattern = /useTranslations(?:<[^>]+>)?\(\s*(['"])(.*?)\1\s*\)/g
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (!/^['"]use client['"]/m.test(source)) continue
    let match: RegExpExecArray | null
    while ((match = namespacePattern.exec(source))) {
      namespaces.add(match[2].split('.')[0])
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

  it('keeps route-specific profiles aligned with imported client components', () => {
    const appChromeRoots = [
      'src/components/AppShell.tsx',
      'src/components/ToastProvider.tsx',
      'src/components/ConfirmDialog.tsx',
      'src/components/UnsavedChangesProvider.tsx',
      'src/components/SystemNoticesBanner.tsx',
      'src/components/ImpersonationBanner.tsx',
    ] as const
    const routeProfiles = [
      {
        label: 'event detail',
        pathname: '/events/event-1',
        roots: [...appChromeRoots, 'src/app/(app-shell)/events/[id]/page.tsx'],
      },
      {
        label: 'event party edit',
        pathname: '/events/event-1/party/1',
        roots: [...appChromeRoots, 'src/app/(app-shell)/events/[id]/party/[partyNumber]/page.tsx'],
      },
      {
        label: 'regear',
        pathname: '/regear',
        roots: [...appChromeRoots, 'src/app/(app-shell)/regear/page.tsx'],
      },
      {
        label: 'my regear detail',
        pathname: '/me/regear/request-1',
        roots: [...appChromeRoots, 'src/app/(app-shell)/me/regear/[id]/page.tsx'],
      },
      {
        label: 'my settings',
        pathname: '/me/settings',
        roots: [...appChromeRoots, 'src/app/(app-shell)/me/settings/page.tsx'],
      },
      {
        label: 'members',
        pathname: '/members',
        roots: [...appChromeRoots, 'src/app/(app-shell)/members/page.tsx'],
      },
      {
        label: 'shop',
        pathname: '/shop',
        roots: [...appChromeRoots, 'src/app/(app-shell)/shop/page.tsx'],
      },
      {
        label: 'own public guild profile',
        pathname: '/public/g/menhera',
        roots: [...appChromeRoots, 'src/app/(app-shell)/public/(marketing)/g/[slug]/page.tsx'],
      },
    ]
    const allMessages = messagesFor(CLIENT_MESSAGE_NAMESPACES)
    const profileMisses = routeProfiles.flatMap(({ label, pathname, roots }) => {
      const used = usedClientTranslationNamespacesFromFiles(importedSourceFiles(roots))
      const selected = new Set(Object.keys(getClientMessagesForPathname(allMessages, pathname)))
      const missing = [...used].filter((namespace) => !selected.has(namespace)).sort()
      return missing.map((namespace) => `${label}: ${namespace}`)
    })

    expect(profileMisses).toEqual([])
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

  it('keeps AppSidebar navigation messages on public guild pages', () => {
    const messages = {
      common: { save: 'save' },
      publicGuildProfile: { title: 'guild' },
      publicMarketing: { title: 'marketing' },
      sidebar: { memberGroup: 'member' },
      adminGuildProfile: { edit: 'edit' },
      memberTour: { next: 'next' },
      nav: { events: 'events', section: { activity: 'activity' } },
      noticeBannerAdmin: { addLabel: 'add' },
      toast: { saved: 'saved' },
      unsavedChanges: { confirmLeave: 'leave?' },
      shopCatalog: { title: 'catalog' },
    }

    expect(getClientMessagesForPathname(messages, '/public/g/menhera')).toEqual({
      common: { save: 'save' },
      publicGuildProfile: { title: 'guild' },
      publicMarketing: { title: 'marketing' },
      sidebar: { memberGroup: 'member' },
      adminGuildProfile: { edit: 'edit' },
      memberTour: { next: 'next' },
      nav: { events: 'events', section: { activity: 'activity' } },
      noticeBannerAdmin: { addLabel: 'add' },
      toast: { saved: 'saved' },
      unsavedChanges: { confirmLeave: 'leave?' },
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
      'adminSettings',
      'gear',
      'imageCrop',
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
      'adminSettings',
      'gear',
      'imageCrop',
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
      'picker',
      'regear',
      'regearBuildSnapshot',
      'requestExchange',
      'regearBreakdown',
      'regearRejectReason',
      'slotRole',
      'albionIdentityProfile',
      'gear',
      'adminDashboard',
      'members',
      'shopCatalog',
    ])).toEqual([
      ...APP_PROFILE_NAMESPACES,
      'adminTimezone',
      'discordDm',
      'donation',
      'exchangeActions',
      'languageSetting',
      'me',
      'memberActionError',
      'myTimezone',
      'picker',
      'regear',
      'requestExchange',
      'regearBuildSnapshot',
      'regearBreakdown',
      'regearRejectReason',
      'slotRole',
      'albionIdentityProfile',
      'gear',
    ].sort())
  })

  it('uses an event profile for public event details and party editing routes', () => {
    expect(selectedNamespacesFor('/events/event-1/party/1', [
      ...APP_PROFILE_NAMESPACES,
      'adminEditEvent',
      'adminEventPayoutCreate',
      'adminEventsNotice',
      'adminParty',
      'adminTemplates',
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
      'picker',
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
      'adminParty',
      'adminTemplates',
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
      'picker',
      'publishEventBanner',
      'slot',
      'slotRole',
    ].sort())
  })
})
