export const GUILD_FEATURE_KEYS = [
  'workspace',
  'events',
  'members',
  'member_self_service',
  'settings_and_permissions',
  'operation_assets',
  'tactics',
  'supply',
  'guild_economy',
  'guild_shop',
  'member_market',
  'asset_accounting',
  'insights',
  'public_guild_profile',
] as const

export type GuildFeatureKey = (typeof GUILD_FEATURE_KEYS)[number]

export const CONFIGURABLE_GUILD_FEATURE_KEYS = [
  'operation_assets',
  'tactics',
  'supply',
  'guild_economy',
  'guild_shop',
  'member_market',
  'asset_accounting',
  'insights',
  'public_guild_profile',
] as const satisfies readonly GuildFeatureKey[]

export type ConfigurableGuildFeatureKey =
  (typeof CONFIGURABLE_GUILD_FEATURE_KEYS)[number]

export const GUILD_FEATURE_STATES = [
  'disabled',
  'setup_required',
  'enabled',
  'draining',
] as const

export type GuildFeatureState = (typeof GUILD_FEATURE_STATES)[number]
export type GuildFeatureTargetState = Exclude<GuildFeatureState, 'draining'>
export type GuildFeatureUse =
  | 'setup'
  | 'read'
  | 'intake'
  | 'process'
  | 'notify'
  | 'automate'

export interface GuildFeatureUseBoundary {
  key: ConfigurableGuildFeatureKey
  use: GuildFeatureUse
}

export interface GuildFeatureEntry {
  key: GuildFeatureKey
  state: GuildFeatureState
  config: Record<string, unknown>
}

export type GuildFeatureSnapshot = Record<GuildFeatureKey, GuildFeatureEntry>

const CORE_FEATURES = new Set<GuildFeatureKey>([
  'workspace',
  'events',
  'members',
  'member_self_service',
  'settings_and_permissions',
])

export const GUILD_FEATURE_DEPENDENCIES: Readonly<
  Partial<Record<ConfigurableGuildFeatureKey, readonly ConfigurableGuildFeatureKey[]>>
> = {
  guild_shop: ['guild_economy'],
  member_market: ['guild_economy'],
}

export function isGuildFeatureKey(value: unknown): value is GuildFeatureKey {
  return typeof value === 'string' && (
    GUILD_FEATURE_KEYS as readonly string[]
  ).includes(value)
}

export function isConfigurableGuildFeatureKey(
  value: unknown,
): value is ConfigurableGuildFeatureKey {
  return typeof value === 'string' && (
    CONFIGURABLE_GUILD_FEATURE_KEYS as readonly string[]
  ).includes(value)
}

export function isGuildFeatureState(value: unknown): value is GuildFeatureState {
  return typeof value === 'string' && (
    GUILD_FEATURE_STATES as readonly string[]
  ).includes(value)
}

export function isGuildFeatureUseAllowed(
  state: GuildFeatureState,
  use: GuildFeatureUse,
): boolean {
  if (state === 'enabled') return true
  if (state === 'setup_required') return use === 'setup'
  if (state === 'draining') {
    return use === 'setup' || use === 'read' || use === 'process' || use === 'notify'
  }
  return false
}

export function isGuildFeatureDiscoverable(state: GuildFeatureState): boolean {
  return state === 'enabled' || state === 'draining'
}

const DISCORD_COMMAND_FEATURE_BOUNDARIES: Readonly<
  Record<string, GuildFeatureUseBoundary>
> = {
  'wallet.balance': { key: 'guild_economy', use: 'read' },
  'wallet.send': { key: 'guild_economy', use: 'intake' },
  'wallet.withdraw': { key: 'guild_economy', use: 'intake' },
  'wallet.history': { key: 'guild_economy', use: 'read' },
  'admin.points': { key: 'guild_economy', use: 'intake' },
  'stats.me': { key: 'insights', use: 'read' },
  'stats.member': { key: 'insights', use: 'read' },
  'stats.leaderboard': { key: 'insights', use: 'read' },
  'regear.eligible': { key: 'supply', use: 'intake' },
  'regear.status': { key: 'supply', use: 'read' },
  'craft.queue': { key: 'supply', use: 'read' },
  'craft.mine': { key: 'supply', use: 'read' },
  'craft.claim': { key: 'supply', use: 'process' },
  'craft.release': { key: 'supply', use: 'process' },
  'craft.deliver': { key: 'supply', use: 'process' },
  'craft.pickup': { key: 'supply', use: 'process' },
  'siphon.balance': { key: 'asset_accounting', use: 'read' },
  'siphon.history': { key: 'asset_accounting', use: 'read' },
  'shop.status': { key: 'guild_shop', use: 'read' },
  'shop.order': { key: 'guild_shop', use: 'intake' },
  'shop.reorder': { key: 'guild_shop', use: 'intake' },
}

const APPLICATION_COMMAND_FEATURE_BOUNDARIES: Readonly<
  Record<string, GuildFeatureUseBoundary>
> = {
  'point.transfer': { key: 'guild_economy', use: 'intake' },
  'shop.order': { key: 'guild_shop', use: 'intake' },
  'craft.deliver': { key: 'supply', use: 'process' },
}

const ADMIN_NOTIFICATION_FEATURE_BOUNDARIES: Readonly<
  Record<string, GuildFeatureUseBoundary>
> = {
  regear: { key: 'supply', use: 'notify' },
  craft: { key: 'supply', use: 'notify' },
  exchange: { key: 'guild_economy', use: 'notify' },
  donation: { key: 'guild_economy', use: 'notify' },
  event_payout: { key: 'guild_economy', use: 'notify' },
  shop: { key: 'guild_shop', use: 'notify' },
}

// Discord is an adapter over the same app domains. Keeping this mapping in the
// product catalog prevents a disabled feature from remaining writable through
// a stale command or confirmation button. Battle commands are intentionally
// absent because battlelog work belongs to a separate product boundary.
export function resolveGuildFeatureForDiscordCommand(
  path: string,
): GuildFeatureUseBoundary | null {
  return DISCORD_COMMAND_FEATURE_BOUNDARIES[path] ?? null
}

export function resolveGuildFeatureForApplicationCommand(
  commandName: string,
): GuildFeatureUseBoundary | null {
  return APPLICATION_COMMAND_FEATURE_BOUNDARIES[commandName] ?? null
}

export function resolveGuildFeatureForAdminNotification(
  topic: string,
): GuildFeatureUseBoundary | null {
  return ADMIN_NOTIFICATION_FEATURE_BOUNDARIES[topic] ?? null
}

export function resolveGuildFeatureForSettingKey(
  key: string,
): ConfigurableGuildFeatureKey | null {
  if (
    key.startsWith('regear_') ||
    key.startsWith('auto_regear_') ||
    key.startsWith('craft_regear_') ||
    key === 'alliance_regear_enabled'
  ) return 'supply'
  if (
    key.startsWith('shop_') ||
    key.startsWith('aodp_') ||
    key === 'log_start_shop_chest_at'
  ) return 'guild_shop'
  if (key.startsWith('siphon_') || key === 'log_start_siphon_at') {
    return 'asset_accounting'
  }
  if (key.startsWith('guild_profile_') || key === 'landing_cta_text') {
    return 'public_guild_profile'
  }
  if (key.startsWith('tactics_')) return 'tactics'
  return null
}

export function resolveGuildFeatureForNoticeTarget(
  target: string,
): ConfigurableGuildFeatureKey | null {
  if (target === 'regear') return 'supply'
  if (target === 'shop') return 'guild_shop'
  return null
}

export function resolveGuildFeatureForOperationsQueue(
  queueKey: string,
): ConfigurableGuildFeatureKey | null {
  if (queueKey === 'regear' || queueKey === 'craft') return 'supply'
  if (
    queueKey === 'exchange' ||
    queueKey === 'donation' ||
    queueKey === 'eventPayout'
  ) return 'guild_economy'
  if (queueKey === 'shop') return 'guild_shop'
  if (queueKey === 'memberTrade') return 'member_market'
  return null
}

export function isGuildFeatureQueueDiscoverable(
  snapshot: GuildFeatureSnapshot,
  queueKey: string,
): boolean {
  const featureKey = resolveGuildFeatureForOperationsQueue(queueKey)
  return !featureKey || isGuildFeatureDiscoverable(snapshot[featureKey].state)
}

export function createFailClosedGuildFeatureSnapshot(): GuildFeatureSnapshot {
  return Object.fromEntries(
    GUILD_FEATURE_KEYS.map((key) => [key, {
      key,
      state: CORE_FEATURES.has(key) ? 'enabled' : 'disabled',
      config: {},
    }]),
  ) as GuildFeatureSnapshot
}

export function buildGuildFeatureSnapshot(
  rows: readonly {
    feature_key: unknown
    state: unknown
    config: unknown
  }[],
): GuildFeatureSnapshot {
  const snapshot = createFailClosedGuildFeatureSnapshot()
  for (const row of rows) {
    if (!isGuildFeatureKey(row.feature_key) || !isGuildFeatureState(row.state)) {
      continue
    }
    snapshot[row.feature_key] = {
      key: row.feature_key,
      state: row.state,
      config:
        row.config && typeof row.config === 'object' && !Array.isArray(row.config)
          ? row.config as Record<string, unknown>
          : {},
    }
  }
  return snapshot
}

const FEATURE_PATHS: readonly {
  key: ConfigurableGuildFeatureKey
  prefixes: readonly string[]
  exact?: readonly string[]
}[] = [
  {
    key: 'tactics',
    prefixes: ['/tactics', '/admin/dashboard/tactics'],
  },
  {
    key: 'supply',
    prefixes: [
      '/regear',
      '/me/regear',
      '/craft',
      '/admin/dashboard/craft',
      '/admin/dashboard/inventory',
      '/admin/dashboard/regear-windows',
    ],
  },
  {
    key: 'guild_shop',
    prefixes: ['/shop', '/admin/dashboard/shop'],
  },
  {
    key: 'member_market',
    prefixes: ['/market'],
  },
  {
    key: 'guild_economy',
    prefixes: [
      '/admin/dashboard/exchanges',
      '/admin/dashboard/donations',
      '/admin/dashboard/special-rewards',
      '/admin/dashboard/role-rewards',
      '/me/wallet',
    ],
  },
  {
    key: 'asset_accounting',
    prefixes: [
      '/admin/dashboard/siphon',
      '/admin/dashboard/settlements',
      '/admin/dashboard/loot-audit',
      '/me/settlements',
      '/me/siphon',
    ],
  },
  {
    key: 'insights',
    prefixes: ['/admin/dashboard/stats', '/leaderboard'],
  },
  {
    key: 'operation_assets',
    prefixes: ['/admin/dashboard/builds', '/admin/dashboard/templates'],
  },
  {
    key: 'public_guild_profile',
    prefixes: ['/admin/dashboard/guild-profile'],
  },
]

function pathMatches(pathname: string, candidate: string): boolean {
  return pathname === candidate || pathname.startsWith(`${candidate}/`)
}

export function resolveGuildFeatureForPathname(
  pathname: string,
): ConfigurableGuildFeatureKey | null {
  if (/^\/events\/[^/]+\/tactic(?:\/|$)/.test(pathname)) return 'tactics'
  for (const route of FEATURE_PATHS) {
    if (route.exact?.includes(pathname)) return route.key
    if (route.prefixes.some((prefix) => pathMatches(pathname, prefix))) {
      return route.key
    }
  }
  return null
}

// `/regear`와 `/me/regear/*`는 지원 중단 후에도 과거 지급 기록을 확인해야 한다.
// 신규 신청은 별도의 action/DB intake gate가 차단한다.
export function isPreservedSupplyHistoryPath(pathname: string): boolean {
  return pathname === '/regear' || pathname.startsWith('/me/regear/')
}
