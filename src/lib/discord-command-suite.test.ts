import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import discordCommandCatalog from './discord-command-catalog.mjs'
import { resolveDiscordCommandLocale } from './discord-commands'
import type {
  DiscordInteractionOption,
  DiscordInteractionPayload,
} from './discord-interactions'
import {
  discordApprovalKindLabel,
  discordBattleOutcomeLabel,
  discordPointReasonLabel,
  discordStatusLabel,
  loadDiscordCommandSuiteMessages,
} from './discord-command-suite-messages'
import {
  buildOwnedEventSignupClearPatch,
  canCancelEventSignup,
  parseDiscordAgmCommand,
} from './discord-command-suite'

interface CatalogOption {
  name: string
  description: string
  description_localizations?: Record<string, string>
  type: number
  autocomplete?: boolean
  required?: boolean
  choices?: Array<{
    name: string
    name_localizations?: Record<string, string>
    value: string | number
  }>
  options?: CatalogOption[]
}

const EXPECTED_COMMAND_PATHS = [
  '/agm setup',
  '/agm login',
  '/agm help',
  '/agm me summary',
  '/agm me verify',
  '/agm event next',
  '/agm event browse',
  '/agm event status',
  '/agm event cancel',
  '/agm wallet balance',
  '/agm wallet send',
  '/agm wallet withdraw',
  '/agm wallet history',
  '/agm stats me',
  '/agm stats member',
  '/agm stats leaderboard',
  '/agm stats battle',
  '/agm regear eligible',
  '/agm regear status',
  '/agm craft queue',
  '/agm craft mine',
  '/agm craft claim',
  '/agm craft release',
  '/agm craft deliver',
  '/agm craft pickup',
  '/agm siphon balance',
  '/agm siphon history',
  '/agm shop status',
  '/agm shop order',
  '/agm shop reorder',
  '/agm admin approvals',
  '/agm admin event-create',
  '/agm admin event-start',
  '/agm admin points',
  '/agm admin quick-publish',
  '/agm admin dashboard',
] as const

const REMOVED_COMMAND_PATHS = [
  '/agm quick',
  '/agm guide',
  '/agm open',
  '/agm me profile',
  '/agm wallet open',
  '/agm admin killbot',
] as const

function leafPaths(root: string, options: readonly CatalogOption[]): string[] {
  return options.flatMap((option) => {
    const path = `${root} ${option.name}`
    if (option.type === 2) return leafPaths(path, option.options ?? [])
    return [path]
  })
}

function allCommandNodes(options: readonly CatalogOption[]): CatalogOption[] {
  return options.flatMap((option) => [option, ...allCommandNodes(option.options ?? [])])
}

describe('complete Discord command suite', () => {
  it('publishes the complete command tree and removes superseded aliases', () => {
    const command = discordCommandCatalog[0] as typeof discordCommandCatalog[0] & {
      options: CatalogOption[]
    }
    const paths = leafPaths('/agm', command.options)

    expect(paths).toEqual(EXPECTED_COMMAND_PATHS)
    for (const removed of REMOVED_COMMAND_PATHS) {
      expect(paths).not.toContain(removed)
    }
  })

  it('localizes every visible command node for all supported Discord locales', () => {
    const command = discordCommandCatalog[0] as typeof discordCommandCatalog[0] & {
      options: CatalogOption[]
    }
    const nodes = allCommandNodes(command.options)

    for (const node of nodes) {
      expect(node.description.length).toBeGreaterThan(0)
      expect(node.description_localizations?.ko).toBeTruthy()
      expect(node.description_localizations?.ja).toBeTruthy()
      expect(node.description_localizations?.['zh-CN']).toBeTruthy()
      expect(node.description_localizations?.['zh-TW']).toBeTruthy()
    }
  })

  it('uses autocomplete for tenant-scoped entity identifiers', () => {
    const command = discordCommandCatalog[0] as typeof discordCommandCatalog[0] & {
      options: CatalogOption[]
    }
    const nodes = allCommandNodes(command.options)
    const autocompleteOptions = nodes
      .filter((node) => node.autocomplete)
      .map((node) => node.name)

    expect(autocompleteOptions).toEqual([
      'event',
      'battle',
      'task',
      'task',
      'task',
      'task',
      'item',
      'order',
      'event',
    ])
  })

  it('stays within Discord command schema limits', () => {
    const command = discordCommandCatalog[0] as typeof discordCommandCatalog[0] & {
      options: CatalogOption[]
    }
    const nodes = allCommandNodes(command.options)

    expect(command.options.length).toBeLessThanOrEqual(25)
    for (const node of nodes) {
      expect(node.name).toMatch(/^[a-z0-9_-]{1,32}$/)
      expect(node.description.length).toBeGreaterThanOrEqual(1)
      expect(node.description.length).toBeLessThanOrEqual(100)
      expect(node.options?.length ?? 0).toBeLessThanOrEqual(25)
      expect(node.choices?.length ?? 0).toBeLessThanOrEqual(25)

      let optionalSeen = false
      for (const child of node.options ?? []) {
        if (child.type === 1 || child.type === 2) continue
        if (!child.required) optionalSeen = true
        if (optionalSeen) expect(child.required).not.toBe(true)
      }
      for (const item of node.choices ?? []) {
        expect(item.name.length).toBeLessThanOrEqual(100)
        expect(item.name_localizations?.ko).toBeTruthy()
        expect(item.name_localizations?.ja).toBeTruthy()
        expect(item.name_localizations?.['zh-CN']).toBeTruthy()
        expect(item.name_localizations?.['zh-TW']).toBeTruthy()
      }
    }
  })

  it('answers in the invoking Discord client locale with a safe English fallback', () => {
    expect(resolveDiscordCommandLocale({ locale: 'ko' })).toBe('ko')
    expect(resolveDiscordCommandLocale({ locale: 'ja-JP' })).toBe('ja')
    expect(resolveDiscordCommandLocale({ locale: 'zh-CN' })).toBe('zh')
    expect(resolveDiscordCommandLocale({ locale: 'de' })).toBe('en')
  })

  it('defers slash-command database work before running the handler', () => {
    const routeSource = readFileSync(
      new URL('../app/api/discord/interactions/route.ts', import.meta.url),
      'utf8',
    )

    expect(routeSource).toMatch(
      /INTERACTION_TYPE_APPLICATION_COMMAND[\s\S]*deferredEphemeralReply\(\)[\s\S]*after\(/,
    )
  })

  it('keeps retired payloads as unregistered rollout aliases', () => {
    const legacyPayload = (options: DiscordInteractionOption[]) => ({
        id: '1',
        type: 2,
        data: { name: 'agm', options },
      }) as DiscordInteractionPayload

    expect(parseDiscordAgmCommand(legacyPayload([
      { name: 'quick', type: 1 },
    ])).path).toBe('help')
    expect(parseDiscordAgmCommand(legacyPayload([
      {
        name: 'open',
        type: 1,
        options: [{ name: 'page', type: 3, value: 'events' }],
      },
    ])).path).toBe('event.next')
    expect(parseDiscordAgmCommand(legacyPayload([
      {
        name: 'me',
        type: 2,
        options: [{ name: 'profile', type: 1 }],
      },
    ])).path).toBe('me.summary')
  })

  it('clears only the invoking member fields when cancelling an event signup', () => {
    const requestedOnly = buildOwnedEventSignupClearPatch({
      assigned_discord_id: '222222222222222222',
      requested_discord_id: '111111111111111111',
    }, '111111111111111111')

    expect(requestedOnly).toMatchObject({
      requested_discord_id: null,
      requested_username: null,
      requested_picks: null,
      requested_at: null,
    })
    expect(requestedOnly).not.toHaveProperty('assigned_discord_id')
    expect(requestedOnly).not.toHaveProperty('assigned_weapon_id')

    const assignedOnly = buildOwnedEventSignupClearPatch({
      assigned_discord_id: '111111111111111111',
      requested_discord_id: '222222222222222222',
    }, '111111111111111111')
    expect(assignedOnly).toMatchObject({
      assigned_discord_id: null,
      assigned_weapon_id: null,
    })
    expect(assignedOnly).not.toHaveProperty('requested_discord_id')
  })

  it('does not create an event cancellation patch for another member slot', () => {
    expect(buildOwnedEventSignupClearPatch({
      assigned_discord_id: '222222222222222222',
      requested_discord_id: '333333333333333333',
    }, '111111111111111111')).toBeNull()
  })

  it('preserves the canonical FF and ganking cancellation policy after battle start', () => {
    expect(canCancelEventSignup({ battle_started_at: null, category: '전투' })).toBe(true)
    expect(canCancelEventSignup({ battle_started_at: '2026-07-22T00:00:00Z', category: '전투' }))
      .toBe(false)
    expect(canCancelEventSignup({ battle_started_at: '2026-07-22T00:00:00Z', category: 'FF' }))
      .toBe(true)
    expect(canCancelEventSignup({ battle_started_at: '2026-07-22T00:00:00Z', category: '갱킹' }))
      .toBe(true)
  })

  it('uses route-safe shop invalidation and authoritative pending approval sources', () => {
    const source = readFileSync(
      new URL('./discord-command-commerce-admin.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('markPublicShopCacheStale(input.tenant.id)')
    expect(source).not.toContain('revalidatePublicShopCache(input.tenant.id)')
    expect(source).not.toContain(".from('admin_notification_deliveries')")
    for (const table of [
      'regear_requests',
      'exchange_requests',
      'donation_requests',
      'shop_orders',
      'event_payout_requests',
      'craft_tasks',
    ]) {
      expect(source).toContain(`.from('${table}')`)
    }
    expect(source).toContain('summary:')
    expect(source).toContain('summary: row.summary')
    expect(source).toContain(".select('id, username, silver, created_at')")
    expect(source).toContain('participant_count, total_silver')
    expect(source).toContain('craft_orders!inner(item_name, unit_price_silver)')
  })

  it('keys battle autocomplete, lookup, and web links by the canonical view row', () => {
    const statsSource = readFileSync(
      new URL('./discord-command-stats-craft.ts', import.meta.url),
      'utf8',
    )
    const autocompleteSource = readFileSync(
      new URL('./discord-command-autocomplete.ts', import.meta.url),
      'utf8',
    )

    expect(statsSource).toContain(".from('guild_battle_views')")
    expect(statsSource).toContain(".eq('id', viewId)")
    expect(statsSource).toContain('/battles/${data.id}')
    expect(autocompleteSource).toContain(".from('guild_battle_views')")
    expect(autocompleteSource).toContain('value: row.id as string')
    expect(autocompleteSource).toMatch(
      /if \(search\)[\s\S]*?(?:\.eq\('albion_battle_id'|\.ilike\('opponent_force_name')[\s\S]*?\.limit\(25\)/,
    )
  })

  it('lets event-specific access checks run before the suite member gate', () => {
    const source = readFileSync(
      new URL('./discord-command-suite.ts', import.meta.url),
      'utf8',
    )
    const eventBranch = source.indexOf("if (input.path === 'event.next')")
    const memberGate = source.indexOf('const actorOrResponse = await requireActor')

    expect(eventBranch).toBeGreaterThan(-1)
    expect(memberGate).toBeGreaterThan(eventBranch)
    expect(source).toContain("member: input.path !== 'event.cancel' && !input.path.startsWith('admin.')")
    const autocompleteSource = readFileSync(
      new URL('./discord-command-autocomplete.ts', import.meta.url),
      'utf8',
    )
    expect(autocompleteSource).toContain(
      "requireMember: parsed.path !== 'event.cancel' && !parsed.path.startsWith('admin.')",
    )
  })

  it('keeps build-sheet cancellation on the canonical web workflow', () => {
    const source = readFileSync(
      new URL('./discord-command-suite.ts', import.meta.url),
      'utf8',
    )
    const autocompleteSource = readFileSync(
      new URL('./discord-command-autocomplete.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('recruitment_mode')
    expect(source).toContain("event.recruitment_mode === 'build_sheet'")
    expect(source).toContain('messages.eventCancelRequiresWeb')
    expect(autocompleteSource).toContain(".neq('recruitment_mode', 'build_sheet')")
  })

  it('lets requesters and task owners autocomplete pickup and release tasks', () => {
    const source = readFileSync(
      new URL('./discord-command-autocomplete.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain(
      "const requiresCurrentCrafter = parsed.path === 'craft.claim' || parsed.path === 'craft.deliver'",
    )
  })

  it('filters craft autocomplete search before applying the Discord result limit', () => {
    const source = readFileSync(
      new URL('./discord-command-autocomplete.ts', import.meta.url),
      'utf8',
    )
    const craftStart = source.indexOf('async function autocompleteCraftTasks')
    const craftEnd = source.indexOf('async function autocompleteShopItems')
    const craftSource = source.slice(craftStart, craftEnd)

    expect(craftSource).toContain("referencedTable: 'regear_requests'")
    expect(craftSource.indexOf("referencedTable: 'regear_requests'")).toBeLessThan(
      craftSource.indexOf('.limit(25)'),
    )
  })

  it('localizes database codes instead of exposing internal enum values', async () => {
    const messages = await loadDiscordCommandSuiteMessages('ko')

    expect(discordStatusLabel('pending', messages)).toBe('대기')
    expect(discordApprovalKindLabel('event_payout', messages)).toBe('이벤트 정산')
    expect(discordBattleOutcomeLabel('disadvantage', messages)).toBe('열세')
    expect(discordPointReasonLabel('transfer_in', messages)).toBe('포인트 수신')
    expect(discordStatusLabel('future_status', messages)).toBe('알 수 없음')
  })

  it('uses one-time Discord app login links for command and event web buttons', () => {
    const sharedSource = readFileSync(
      new URL('./discord-command-suite-shared.ts', import.meta.url),
      'utf8',
    )
    const eventSource = readFileSync(
      new URL('./discord-event-signups.ts', import.meta.url),
      'utf8',
    )

    expect(sharedSource).toContain('createDiscordAppLoginLink')
    expect(sharedSource).not.toContain('tenantUrl(')
    expect(eventSource).toContain('createDiscordAppLoginLink')
    expect(eventSource).toContain('suppressEmbeds: true')
  })

  it('prioritizes current events before the autocomplete result cap', () => {
    const source = readFileSync(
      new URL('./discord-command-autocomplete.ts', import.meta.url),
      'utf8',
    )
    const eventStart = source.indexOf('async function autocompleteEvents')
    const eventEnd = source.indexOf('async function autocompleteBattles')
    const eventSource = source.slice(eventStart, eventEnd)

    expect(source).toContain('CURRENT_EVENT_LOOKBACK_MS')
    expect(eventSource).toContain(".gte('gather_at', currentWindowStart)")
    expect(eventSource.indexOf(".gte('gather_at', currentWindowStart)")).toBeLessThan(
      eventSource.indexOf('.limit(25)'),
    )
  })

  it('honors the guild craft feature toggle in commands and autocomplete', () => {
    const suiteSource = readFileSync(
      new URL('./discord-command-suite.ts', import.meta.url),
      'utf8',
    )
    const autocompleteSource = readFileSync(
      new URL('./discord-command-autocomplete.ts', import.meta.url),
      'utf8',
    )

    expect(suiteSource).toContain("getAppSetting('craft_regear_enabled', 'false', input.tenant.id)")
    expect(suiteSource).toContain('messages.craftDisabled')
    expect(autocompleteSource).toContain(
      "getAppSetting('craft_regear_enabled', 'false', tenant.id)",
    )
  })

  it('uses the Discord guild locale for a persistent public panel', () => {
    const source = readFileSync(
      new URL('./discord-commands.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('resolveDiscordPublicPanelLocale')
    expect(source).toContain('payload?.guild_locale')
    expect(source).toContain('panelMessages')
  })

  it('documents the FF and ganking post-start cancellation exception', () => {
    const docs = readFileSync(
      new URL('../app/(public-shell)/public/(marketing)/docs/discord/commands/page.mdx', import.meta.url),
      'utf8',
    )

    expect(docs).toContain('FF·갱킹')
    expect(docs).toContain('전투 시작 후에도 취소')
  })
})
