import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import { isSiteNicknameOverrideStoreUnavailableError } from '@/lib/site-nickname-override'
import {
  normalizeSuperAdminUserSearchQuery,
  toIlikeContainsPattern,
} from '@/lib/super-admin-user-search-utils'

const SEARCH_ROWS_PER_COLUMN = 25
const MAX_ACCOUNT_SEARCH_RESULTS = 80

export type SuperAdminAccountSearchSource =
  | 'member'
  | 'identity_link'
  | 'account_profile'
  | 'albion_roster'

export interface SuperAdminAccountSearchRow {
  source: SuperAdminAccountSearchSource
  tenantId: string | null
  tenantName: string | null
  tenantSlug: string | null
  tenantStatus: string | null
  discordId: string | null
  username: string | null
  publicDiscordHandle: string | null
  withdrawnAt: string | null
  updatedAt: string | null
  albionServer: string | null
  albionPlayerId: string | null
  albionPlayerName: string | null
  relation: string | null
  trustStatus: string | null
  revokedAt: string | null
  leftAt: string | null
  lastSeenAt: string | null
}

export type SuperAdminAccountSearchResult =
  | { ok: true; query: string; results: SuperAdminAccountSearchRow[] }
  | { ok: false; query: string; error: string }

export interface SiteNicknameOverrideDetail {
  discordId: string
  nickname: string
  updatedByDiscordId: string
  reason: string | null
  createdAt: string
  updatedAt: string
}

export interface SiteUserPresenceRow {
  kind: 'member' | 'guest'
  guildId: string
  username: string
  avatar: string | null
  updatedAt: string | null
  withdrawnAt: string | null
  albionNickname: string | null
}

export interface SiteUserTenant {
  id: string
  name: string
  slug: string
  status: string
}

export interface SiteUserLookup {
  discordId: string
  override: SiteNicknameOverrideDetail | null
  overrideStoreAvailable: boolean
  presences: SiteUserPresenceRow[]
  tenants: Map<string, SiteUserTenant>
}

interface OverrideRow {
  discord_id: string
  nickname: string
  updated_by_discord_id: string
  reason: string | null
  created_at: string
  updated_at: string
}

interface GuildAvatarRow {
  guild_id: string
  discord_id?: string
  username: string
  avatar: string | null
  updated_at: string | null
  withdrawn_at: string | null
  albion_nickname: string | null
  albion_server?: string | null
  albion_player_id?: string | null
  public_discord_handle?: string | null
}

interface GuestRow {
  guild_id: string
  username: string
  avatar: string | null
  joined_at: string | null
}

interface TenantRow {
  id: string
  name: string
  slug: string
  status?: string
}

interface AccountAlbionProfileRow {
  discord_id: string
  albion_server: string | null
  albion_player_id: string | null
  albion_player_name: string | null
  claim_status: string | null
  revoked_at: string | null
  updated_at: string | null
}

interface AccountAlbionTenantLinkRow {
  guild_id: string
  discord_id: string
  albion_server: string | null
  albion_player_id: string | null
  albion_player_name: string | null
  relation: string | null
  trust_status: string | null
  revoked_at: string | null
  updated_at: string | null
}

interface AlbionGuildMemberRow {
  guild_id: string
  albion_server: string | null
  albion_player_id: string
  albion_player_name: string
  left_at: string | null
  last_seen_at: string | null
}

function uniqueBy<T>(rows: readonly T[], getKey: (row: T) => string): T[] {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const row of rows) {
    const key = getKey(row)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(row)
  }
  return unique
}

function sourceRank(source: SuperAdminAccountSearchSource): number {
  if (source === 'member') return 0
  if (source === 'identity_link') return 1
  if (source === 'account_profile') return 2
  return 3
}

function attachTenant(
  row: Omit<SuperAdminAccountSearchRow, 'tenantName' | 'tenantSlug' | 'tenantStatus'>,
  tenants: Map<string, SiteUserTenant>,
): SuperAdminAccountSearchRow {
  const tenant = row.tenantId ? tenants.get(row.tenantId) : null
  return {
    ...row,
    tenantName: tenant?.name ?? null,
    tenantSlug: tenant?.slug ?? null,
    tenantStatus: tenant?.status ?? null,
  }
}

function sortSearchRows(a: SuperAdminAccountSearchRow, b: SuperAdminAccountSearchRow): number {
  const tenantCompare = (a.tenantName ?? '').localeCompare(b.tenantName ?? '')
  if (tenantCompare !== 0) return tenantCompare

  const sourceCompare = sourceRank(a.source) - sourceRank(b.source)
  if (sourceCompare !== 0) return sourceCompare

  const aTime = a.withdrawnAt ?? a.revokedAt ?? a.leftAt ?? a.updatedAt ?? a.lastSeenAt ?? ''
  const bTime = b.withdrawnAt ?? b.revokedAt ?? b.leftAt ?? b.updatedAt ?? b.lastSeenAt ?? ''
  return bTime.localeCompare(aTime)
}

function toOverride(row: OverrideRow | null): SiteNicknameOverrideDetail | null {
  if (!row) return null
  return {
    discordId: row.discord_id,
    nickname: row.nickname,
    updatedByDiscordId: row.updated_by_discord_id,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function lookupSiteUserByDiscordId(discordId: string): Promise<SiteUserLookup> {
  const db = getAdminClient()
  const [overrideResult, membersResult, guestsResult] = await Promise.all([
    db
      .from('site_user_nickname_overrides')
      .select('discord_id, nickname, updated_by_discord_id, reason, created_at, updated_at')
      .eq('discord_id', discordId)
      .maybeSingle(),
    db
      .from('guild_avatars')
      .select('guild_id, username, avatar, updated_at, withdrawn_at, albion_nickname')
      .eq('discord_id', discordId)
      .order('updated_at', { ascending: false }),
    db
      .from('guests')
      .select('guild_id, username, avatar, joined_at')
      .eq('discord_id', discordId)
      .order('joined_at', { ascending: false }),
  ])

  let overrideStoreAvailable = true
  if (overrideResult.error) {
    if (!isSiteNicknameOverrideStoreUnavailableError(overrideResult.error)) {
      throw new Error(`nickname override lookup failed: ${overrideResult.error.message}`)
    }
    overrideStoreAvailable = false
  }
  if (membersResult.error) {
    throw new Error(`member lookup failed: ${membersResult.error.message}`)
  }
  if (guestsResult.error) {
    throw new Error(`guest lookup failed: ${guestsResult.error.message}`)
  }

  const memberRows = (membersResult.data ?? []) as GuildAvatarRow[]
  const guestRows = (guestsResult.data ?? []) as GuestRow[]
  const presences: SiteUserPresenceRow[] = [
    ...memberRows.map((row) => ({
      kind: 'member' as const,
      guildId: row.guild_id,
      username: row.username,
      avatar: row.avatar,
      updatedAt: row.updated_at,
      withdrawnAt: row.withdrawn_at,
      albionNickname: row.albion_nickname,
    })),
    ...guestRows.map((row) => ({
      kind: 'guest' as const,
      guildId: row.guild_id,
      username: row.username,
      avatar: row.avatar,
      updatedAt: row.joined_at,
      withdrawnAt: null,
      albionNickname: null,
    })),
  ]

  const tenantIds = Array.from(new Set(presences.map((row) => row.guildId)))
  const tenants = new Map<string, SiteUserTenant>()
  if (tenantIds.length > 0) {
    const { data, error } = await db.from('tenants').select('id, name, slug').in('id', tenantIds)
    if (error) throw new Error(`tenant lookup failed: ${error.message}`)
    for (const row of (data ?? []) as TenantRow[]) {
      tenants.set(row.id, { id: row.id, name: row.name, slug: row.slug, status: row.status ?? '' })
    }
  }

  return {
    discordId,
    override: overrideStoreAvailable ? toOverride((overrideResult.data as OverrideRow | null) ?? null) : null,
    overrideStoreAvailable,
    presences,
    tenants,
  }
}

export async function searchSuperAdminAccounts(rawQuery: string): Promise<SuperAdminAccountSearchResult> {
  const normalized = normalizeSuperAdminUserSearchQuery(rawQuery)
  if (!normalized.ok) return { ok: false, query: rawQuery.trim(), error: normalized.error }

  const db = getAdminClient()
  const pattern = toIlikeContainsPattern(normalized.query)

  const [
    avatarDiscordId,
    avatarUsername,
    avatarAlbionNickname,
    avatarAlbionPlayerId,
    avatarPublicHandle,
    profileDiscordId,
    profileAlbionPlayerName,
    profileAlbionPlayerId,
    linkDiscordId,
    linkAlbionPlayerName,
    linkAlbionPlayerId,
    rosterAlbionPlayerName,
    rosterAlbionPlayerId,
  ] = await Promise.all([
    db
      .from('guild_avatars')
      .select('guild_id, discord_id, username, updated_at, withdrawn_at, albion_server, albion_nickname, albion_player_id, public_discord_handle')
      .ilike('discord_id', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('guild_avatars')
      .select('guild_id, discord_id, username, updated_at, withdrawn_at, albion_server, albion_nickname, albion_player_id, public_discord_handle')
      .ilike('username', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('guild_avatars')
      .select('guild_id, discord_id, username, updated_at, withdrawn_at, albion_server, albion_nickname, albion_player_id, public_discord_handle')
      .ilike('albion_nickname', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('guild_avatars')
      .select('guild_id, discord_id, username, updated_at, withdrawn_at, albion_server, albion_nickname, albion_player_id, public_discord_handle')
      .ilike('albion_player_id', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('guild_avatars')
      .select('guild_id, discord_id, username, updated_at, withdrawn_at, albion_server, albion_nickname, albion_player_id, public_discord_handle')
      .ilike('public_discord_handle', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('account_albion_profiles')
      .select('discord_id, albion_server, albion_player_id, albion_player_name, claim_status, revoked_at, updated_at')
      .ilike('discord_id', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('account_albion_profiles')
      .select('discord_id, albion_server, albion_player_id, albion_player_name, claim_status, revoked_at, updated_at')
      .ilike('albion_player_name', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('account_albion_profiles')
      .select('discord_id, albion_server, albion_player_id, albion_player_name, claim_status, revoked_at, updated_at')
      .ilike('albion_player_id', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('account_albion_tenant_links')
      .select('guild_id, discord_id, albion_server, albion_player_id, albion_player_name, relation, trust_status, revoked_at, updated_at')
      .ilike('discord_id', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('account_albion_tenant_links')
      .select('guild_id, discord_id, albion_server, albion_player_id, albion_player_name, relation, trust_status, revoked_at, updated_at')
      .ilike('albion_player_name', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('account_albion_tenant_links')
      .select('guild_id, discord_id, albion_server, albion_player_id, albion_player_name, relation, trust_status, revoked_at, updated_at')
      .ilike('albion_player_id', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('albion_guild_members')
      .select('guild_id, albion_server, albion_player_id, albion_player_name, left_at, last_seen_at')
      .ilike('albion_player_name', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
    db
      .from('albion_guild_members')
      .select('guild_id, albion_server, albion_player_id, albion_player_name, left_at, last_seen_at')
      .ilike('albion_player_id', pattern)
      .limit(SEARCH_ROWS_PER_COLUMN),
  ])

  const responses = [
    avatarDiscordId,
    avatarUsername,
    avatarAlbionNickname,
    avatarAlbionPlayerId,
    avatarPublicHandle,
    profileDiscordId,
    profileAlbionPlayerName,
    profileAlbionPlayerId,
    linkDiscordId,
    linkAlbionPlayerName,
    linkAlbionPlayerId,
    rosterAlbionPlayerName,
    rosterAlbionPlayerId,
  ]
  const failed = responses.find((response) => response.error)
  if (failed?.error) return { ok: false, query: normalized.query, error: failed.error.message }

  const avatarRows = uniqueBy(
    [
      ...((avatarDiscordId.data ?? []) as GuildAvatarRow[]),
      ...((avatarUsername.data ?? []) as GuildAvatarRow[]),
      ...((avatarAlbionNickname.data ?? []) as GuildAvatarRow[]),
      ...((avatarAlbionPlayerId.data ?? []) as GuildAvatarRow[]),
      ...((avatarPublicHandle.data ?? []) as GuildAvatarRow[]),
    ],
    (row) => `${row.guild_id}:${row.discord_id ?? ''}`,
  )
  const profileRows = uniqueBy(
    [
      ...((profileDiscordId.data ?? []) as AccountAlbionProfileRow[]),
      ...((profileAlbionPlayerName.data ?? []) as AccountAlbionProfileRow[]),
      ...((profileAlbionPlayerId.data ?? []) as AccountAlbionProfileRow[]),
    ],
    (row) => `${row.discord_id}:${row.albion_server ?? ''}:${row.albion_player_id ?? ''}:${row.albion_player_name ?? ''}`,
  )
  const linkRows = uniqueBy(
    [
      ...((linkDiscordId.data ?? []) as AccountAlbionTenantLinkRow[]),
      ...((linkAlbionPlayerName.data ?? []) as AccountAlbionTenantLinkRow[]),
      ...((linkAlbionPlayerId.data ?? []) as AccountAlbionTenantLinkRow[]),
    ],
    (row) => `${row.guild_id}:${row.discord_id}:${row.albion_server ?? ''}:${row.albion_player_id ?? ''}`,
  )
  const rosterRows = uniqueBy(
    [
      ...((rosterAlbionPlayerName.data ?? []) as AlbionGuildMemberRow[]),
      ...((rosterAlbionPlayerId.data ?? []) as AlbionGuildMemberRow[]),
    ],
    (row) => `${row.guild_id}:${row.albion_server ?? ''}:${row.albion_player_id}`,
  )

  const tenantIds = Array.from(new Set([
    ...avatarRows.map((row) => row.guild_id),
    ...linkRows.map((row) => row.guild_id),
    ...rosterRows.map((row) => row.guild_id),
  ]))
  const tenants = new Map<string, SiteUserTenant>()
  if (tenantIds.length > 0) {
    const { data, error } = await db.from('tenants').select('id, name, slug, status').in('id', tenantIds)
    if (error) return { ok: false, query: normalized.query, error: error.message }
    for (const row of (data ?? []) as TenantRow[]) {
      tenants.set(row.id, {
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status ?? '',
      })
    }
  }

  const results = [
    ...avatarRows.map((row) => attachTenant({
      source: 'member',
      tenantId: row.guild_id,
      discordId: row.discord_id ?? null,
      username: row.username,
      publicDiscordHandle: row.public_discord_handle ?? null,
      withdrawnAt: row.withdrawn_at,
      updatedAt: row.updated_at,
      albionServer: row.albion_server ?? null,
      albionPlayerId: row.albion_player_id ?? null,
      albionPlayerName: row.albion_nickname,
      relation: null,
      trustStatus: null,
      revokedAt: null,
      leftAt: null,
      lastSeenAt: null,
    }, tenants)),
    ...linkRows.map((row) => attachTenant({
      source: 'identity_link',
      tenantId: row.guild_id,
      discordId: row.discord_id,
      username: null,
      publicDiscordHandle: null,
      withdrawnAt: null,
      updatedAt: row.updated_at,
      albionServer: row.albion_server,
      albionPlayerId: row.albion_player_id,
      albionPlayerName: row.albion_player_name,
      relation: row.relation,
      trustStatus: row.trust_status,
      revokedAt: row.revoked_at,
      leftAt: null,
      lastSeenAt: null,
    }, tenants)),
    ...profileRows.map((row) => attachTenant({
      source: 'account_profile',
      tenantId: null,
      discordId: row.discord_id,
      username: null,
      publicDiscordHandle: null,
      withdrawnAt: null,
      updatedAt: row.updated_at,
      albionServer: row.albion_server,
      albionPlayerId: row.albion_player_id,
      albionPlayerName: row.albion_player_name,
      relation: null,
      trustStatus: row.claim_status,
      revokedAt: row.revoked_at,
      leftAt: null,
      lastSeenAt: null,
    }, tenants)),
    ...rosterRows.map((row) => attachTenant({
      source: 'albion_roster',
      tenantId: row.guild_id,
      discordId: null,
      username: null,
      publicDiscordHandle: null,
      withdrawnAt: null,
      updatedAt: null,
      albionServer: row.albion_server,
      albionPlayerId: row.albion_player_id,
      albionPlayerName: row.albion_player_name,
      relation: null,
      trustStatus: null,
      revokedAt: null,
      leftAt: row.left_at,
      lastSeenAt: row.last_seen_at,
    }, tenants)),
  ].sort(sortSearchRows).slice(0, MAX_ACCOUNT_SEARCH_RESULTS)

  return { ok: true, query: normalized.query, results }
}
