import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { getGuildMemberByBot } from '@/lib/discord'
import {
  getGuild,
  getPlayer,
  isAlbionServer,
  type AlbionServer,
  type GameinfoPlayer,
} from '@/lib/albion-gameinfo'
import { log } from '@/lib/log'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { removeGuestRecordForMember } from '@/lib/guest-membership-transition'
import {
  getAlbionIdentityResourceException,
  matchesAlbionResourceException,
} from '@/lib/albion-identity-resource-exception'

export type AlbionIdentityRelation = 'home_guild' | 'alliance' | 'external' | 'unknown'

export type AlbionIdentityTrustStatus =
  | 'claimed'
  | 'roster_matched'
  | 'trusted'
  | 'disputed'
  | 'revoked'

export interface AccountAlbionIdentityView {
  profileId: string | null
  server: AlbionServer | null
  playerId: string | null
  nickname: string | null
  currentGuildId: string | null
  currentGuildName: string | null
  currentAllianceId: string | null
  currentAllianceName: string | null
  relation: AlbionIdentityRelation
  trustStatus: AlbionIdentityTrustStatus
  statusReason: string | null
  verifiedAt: string | null
  trustedAt: string | null
  lastSyncedAt: string | null
  lastManualSyncAt: string | null
  resourceAccessOverride: boolean
  resourceAccessOverrideGrantedAt: string | null
}

export interface TenantTrustInput {
  relation: AlbionIdentityRelation
  hasPlayerId: boolean
  hasDuplicateClaim: boolean
  legacyTrusted: boolean
  adminApprovedTrusted?: boolean
  hasTrustedDiscordMemberRole: boolean
}

export interface RelationInput {
  homeGuildId: string | null
  homeAllianceId: string | null
  playerGuildId: string | null
  playerAllianceId: string | null
  hasPlayerId: boolean
}

export interface ResourceGateInput {
  relation: AlbionIdentityRelation
  trustStatus: AlbionIdentityTrustStatus
  resourceAccessOverride?: boolean
}

export interface ManualRegearGateInput extends ResourceGateInput {
  allianceRegearEnabled: boolean
}

interface ClaimInput {
  guildId: string
  discordId: string
  server: AlbionServer
  player: GameinfoPlayer | null
  nickname: string
  legacyTrusted: boolean
  adminApprovedTrusted?: boolean
  source: 'member_onboarding' | 'manual_entry' | 'manual_refresh' | 'cron_sync' | 'legacy_backfill'
}

interface ClaimResult {
  profileId: string | null
  relation: AlbionIdentityRelation
  trustStatus: AlbionIdentityTrustStatus
  verifiedAt: string | null
  resourceAccessOverride: boolean
  error?: string
}

const ACCOUNT_TABLE_MISSING_CODES = new Set(['42P01', 'PGRST205'])
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function resolveAlbionIdentityRelation(input: RelationInput): AlbionIdentityRelation {
  if (!input.hasPlayerId) return 'unknown'
  const homeGuildId = input.homeGuildId?.trim() || null
  const playerGuildId = input.playerGuildId?.trim() || null
  if (!homeGuildId || !playerGuildId) return 'external'
  if (homeGuildId === playerGuildId) return 'home_guild'

  const homeAllianceId = input.homeAllianceId?.trim() || null
  const playerAllianceId = input.playerAllianceId?.trim() || null
  if (homeAllianceId && playerAllianceId && homeAllianceId === playerAllianceId) {
    return 'alliance'
  }
  return 'external'
}

export function resolveInitialTenantTrust(input: TenantTrustInput): AlbionIdentityTrustStatus {
  if (input.hasDuplicateClaim) return 'disputed'
  if (!input.hasPlayerId) return 'claimed'
  if (
    input.relation === 'home_guild' &&
    (input.legacyTrusted || input.adminApprovedTrusted || input.hasTrustedDiscordMemberRole)
  ) {
    return 'trusted'
  }
  if (input.relation === 'home_guild') return 'roster_matched'
  return 'claimed'
}

export function canUseGuildResourceFeatures(input: ResourceGateInput): boolean {
  return input.trustStatus !== 'revoked' &&
    (input.resourceAccessOverride === true ||
      (input.relation === 'home_guild' && input.trustStatus === 'trusted'))
}

export function canUseManualRegearFeature(input: ManualRegearGateInput): boolean {
  if (canUseGuildResourceFeatures(input)) return true
  if (!input.allianceRegearEnabled || input.relation !== 'alliance') return false
  return input.trustStatus === 'claimed' || input.trustStatus === 'roster_matched' || input.trustStatus === 'trusted'
}

export function canUseAllianceEventFeatures(input: ResourceGateInput): boolean {
  if (input.relation !== 'alliance') return false
  return input.trustStatus === 'claimed' || input.trustStatus === 'roster_matched' || input.trustStatus === 'trusted'
}

export function hasAlbionCharacterNameChanged(
  previousName: string | null | undefined,
  currentName: string | null | undefined,
): boolean {
  const previous = previousName?.trim() ?? ''
  const current = currentName?.trim() ?? ''
  return previous.length > 0 && current.length > 0 && previous !== current
}

export async function getAccountAlbionIdentityView(
  guildId: string,
  discordId: string,
): Promise<AccountAlbionIdentityView | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('account_albion_tenant_links')
    .select(
      [
        'profile_id',
        'albion_server',
        'albion_player_id',
        'albion_player_name',
        'current_guild_id',
        'current_guild_name',
        'current_alliance_id',
        'current_alliance_name',
        'relation',
        'trust_status',
        'status_reason',
        'verified_at',
        'trusted_at',
        'last_synced_at',
        'last_manual_sync_at',
        'revoked_at',
      ].join(', '),
    )
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle()

  if (isMissingAccountTable(error)) return null
  if (error || !data) return null

  const row = data as unknown as Record<string, unknown>
  const relation = isAlbionIdentityRelation(row.relation) ? row.relation : 'unknown'
  const trustStatus = isAlbionIdentityTrustStatus(row.trust_status)
    ? row.trust_status
    : 'claimed'
  const server = isAlbionServer(row.albion_server) ? row.albion_server : null
  const playerId = (row.albion_player_id as string | null) ?? null
  const resourceException = await getAlbionIdentityResourceException(
    guildId,
    discordId,
    db,
  )
  const resourceAccessOverride = resourceException
    ? matchesAlbionResourceException(resourceException, {
        guildId,
        discordId,
        server,
        playerId,
        trustStatus,
        revokedAt: (row.revoked_at as string | null) ?? null,
      })
    : false

  return {
    profileId: (row.profile_id as string | null) ?? null,
    server,
    playerId,
    nickname: (row.albion_player_name as string | null) ?? null,
    currentGuildId: (row.current_guild_id as string | null) ?? null,
    currentGuildName: (row.current_guild_name as string | null) ?? null,
    currentAllianceId: (row.current_alliance_id as string | null) ?? null,
    currentAllianceName: (row.current_alliance_name as string | null) ?? null,
    relation,
    trustStatus,
    statusReason: (row.status_reason as string | null) ?? null,
    verifiedAt: (row.verified_at as string | null) ?? null,
    trustedAt: (row.trusted_at as string | null) ?? null,
    lastSyncedAt: (row.last_synced_at as string | null) ?? null,
    lastManualSyncAt: (row.last_manual_sync_at as string | null) ?? null,
    resourceAccessOverride,
    resourceAccessOverrideGrantedAt: resourceAccessOverride
      ? resourceException?.grantedAt ?? null
      : null,
  }
}

export async function recordAlbionIdentityClaim(input: ClaimInput): Promise<ClaimResult> {
  const db = getAdminClient()
  const nowIso = new Date().toISOString()
  const playerId = input.player?.Id ?? null
  const playerName = input.player?.Name ?? input.nickname
  const currentGuildId = input.player?.GuildId ?? null
  const currentGuildName = input.player?.GuildName ?? null
  const currentAllianceId = input.player?.AllianceId ?? null
  const currentAllianceName = input.player?.AllianceName ?? null
  const { homeGuildId, homeAllianceId } = await loadHomeAlbionContext(input.guildId, input.server)
  const relation = resolveAlbionIdentityRelation({
    homeGuildId,
    homeAllianceId,
    playerGuildId: currentGuildId,
    playerAllianceId: currentAllianceId,
    hasPlayerId: !!playerId,
  })

  const hasDuplicateClaim =
    playerId !== null
      ? await hasDuplicateActiveClaim(input.server, playerId, input.discordId)
      : false
  const hasTrustedDiscordMemberRole =
    playerId !== null ? await hasTrustedMemberRole(input.guildId, input.discordId) : false
  const trustStatus = resolveInitialTenantTrust({
    relation,
    hasPlayerId: !!playerId,
    hasDuplicateClaim,
    legacyTrusted: input.legacyTrusted,
    adminApprovedTrusted: input.adminApprovedTrusted,
    hasTrustedDiscordMemberRole,
  })
  const verifiedAt = relation === 'home_guild' ? nowIso : null
  const trustedAt = trustStatus === 'trusted' ? nowIso : null
  const statusReason = statusReasonFor(trustStatus, relation, {
    legacyTrusted: input.legacyTrusted,
    adminApprovedTrusted: input.adminApprovedTrusted,
    hasTrustedDiscordMemberRole,
  })

  const profileId = await upsertAccountProfile({
    discordId: input.discordId,
    server: input.server,
    playerId,
    playerName,
    currentGuildId,
    currentGuildName,
    currentAllianceId,
    currentAllianceName,
    source: input.source,
    verifiedAt,
    nowIso,
  })
  if (!profileId) {
    return {
      profileId: null,
      relation,
      trustStatus,
      verifiedAt,
      resourceAccessOverride: false,
    }
  }

  const { error: linkError } = await db
    .from('account_albion_tenant_links')
    .upsert(
      {
        guild_id: input.guildId,
        discord_id: input.discordId,
        profile_id: profileId,
        albion_server: input.server,
        albion_player_id: playerId,
        albion_player_name: playerName,
        current_guild_id: currentGuildId,
        current_guild_name: currentGuildName,
        current_alliance_id: currentAllianceId,
        current_alliance_name: currentAllianceName,
        relation,
        trust_status: trustStatus,
        status_reason: statusReason,
        verified_at: verifiedAt,
        trusted_at: trustedAt,
        disputed_at: trustStatus === 'disputed' ? nowIso : null,
        revoked_at: null,
        last_synced_at: input.player ? nowIso : null,
        updated_at: nowIso,
      },
      { onConflict: 'guild_id,discord_id' },
    )
  if (isMissingAccountTable(linkError)) {
    return {
      profileId: null,
      relation,
      trustStatus,
      verifiedAt,
      resourceAccessOverride: false,
    }
  }
  if (linkError) {
    log.error('[account-albion] tenant link upsert failed', linkError, {
      guild_id: input.guildId,
      discord_id: input.discordId,
      player_id: playerId,
    })
    return {
      profileId,
      relation,
      trustStatus,
      verifiedAt,
      resourceAccessOverride: false,
      error: linkError.message,
    }
  }

  const resourceException = await getAlbionIdentityResourceException(
    input.guildId,
    input.discordId,
    db,
  )
  const resourceAccessOverride = resourceException
    ? matchesAlbionResourceException(resourceException, {
        guildId: input.guildId,
        discordId: input.discordId,
        server: input.server,
        playerId,
        trustStatus,
        revokedAt: null,
      })
    : false

  await writeIdentityAudit({
    guildId: input.guildId,
    discordId: input.discordId,
    profileId,
    action: input.source,
    trustStatus,
    relation,
    reason: statusReason,
  })

  return {
    profileId,
    relation,
    trustStatus,
    verifiedAt,
    resourceAccessOverride,
  }
}

export async function refreshMemberAlbionIdentity(
  guildId: string,
  discordId: string,
  opts: { manual: boolean } = { manual: false },
): Promise<{
  ok?: true
  view?: AccountAlbionIdentityView
  nicknameChanged?: boolean
  throttledUntil?: string
  error?: string
}> {
  const current = await getAccountAlbionIdentityView(guildId, discordId)
  if (!current?.server || !current.playerId || !current.nickname) {
    return { error: 'NO_LINKED_ALBION_PROFILE' }
  }

  if (opts.manual && current.lastManualSyncAt) {
    const nextMs = Date.parse(current.lastManualSyncAt) + ONE_DAY_MS
    if (Number.isFinite(nextMs) && Date.now() < nextMs) {
      return { throttledUntil: new Date(nextMs).toISOString() }
    }
  }

  const player = await getPlayer(current.server, current.playerId)
  if (!player) return { error: 'ALBION_GAMEINFO_UNAVAILABLE' }
  const nicknameChanged = hasAlbionCharacterNameChanged(
    current.nickname,
    player.Name,
  )

  const claim = await recordAlbionIdentityClaim({
    guildId,
    discordId,
    server: current.server,
    player,
    nickname: current.nickname,
    legacyTrusted: current.trustStatus === 'trusted' && current.statusReason === 'legacy_trusted',
    adminApprovedTrusted:
      current.trustStatus === 'trusted' && current.statusReason === 'admin_approved',
    source: opts.manual ? 'manual_refresh' : 'cron_sync',
  })
  if (claim.error) return { error: claim.error }

  const db = getAdminClient()
  const nowIso = new Date().toISOString()
  const resourceAllowed = canUseGuildResourceFeatures({
    relation: claim.relation,
    trustStatus: claim.trustStatus,
    resourceAccessOverride: claim.resourceAccessOverride,
  })
  if (resourceAllowed) {
    await removeGuestRecordForMember(db, {
      guildId,
      discordId,
      source: opts.manual ? 'albion_manual_refresh' : 'albion_auto_refresh',
    })
  }
  const { error: avatarError } = await db
    .from('guild_avatars')
    .update({
      albion_server: current.server,
      albion_player_id: player.Id,
      albion_nickname: player.Name,
      albion_guild_id: player.GuildId,
      albion_verified_at: resourceAllowed ? (claim.verifiedAt ?? nowIso) : null,
    })
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
  if (avatarError) {
    log.error('[account-albion] guild avatar refresh failed', avatarError, {
      guild_id: guildId,
      discord_id: discordId,
    })
  }

  if (opts.manual && claim.profileId) {
    await db
      .from('account_albion_profiles')
      .update({ last_manual_sync_at: nowIso, updated_at: nowIso })
      .eq('id', claim.profileId)
  }
  if (opts.manual) {
    await db
      .from('account_albion_tenant_links')
      .update({ last_manual_sync_at: nowIso, updated_at: nowIso })
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
  }

  revalidatePath('/admin/dashboard')
  revalidatePath('/admin/dashboard/stats')
  revalidatePath(`/members/${discordId}`)
  revalidatePath('/me')
  revalidatePath('/me/profile')
  revalidatePath('/me/siphon')
  revalidatePath('/', 'layout')
  if (opts.manual) {
    revalidatePath('/onboarding/albion')
  }
  return {
    ok: true,
    view: await getAccountAlbionIdentityView(guildId, discordId) ?? undefined,
    nicknameChanged,
  }
}

async function loadHomeAlbionContext(
  guildId: string,
  server: AlbionServer,
): Promise<{ homeGuildId: string | null; homeAllianceId: string | null }> {
  const homeGuildId = (await getAppSetting('albion_home_guild_id', '', guildId)).trim() || null
  if (!homeGuildId) return { homeGuildId: null, homeAllianceId: null }
  const homeGuild = await getGuild(server, homeGuildId)
  return {
    homeGuildId,
    homeAllianceId: homeGuild?.AllianceId?.trim() || null,
  }
}

async function hasDuplicateActiveClaim(
  server: AlbionServer,
  playerId: string,
  discordId: string,
): Promise<boolean> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('account_albion_profiles')
    .select('discord_id')
    .eq('albion_server', server)
    .eq('albion_player_id', playerId)
    .is('revoked_at', null)
    .neq('discord_id', discordId)
    .limit(1)
  if (isMissingAccountTable(error)) return false
  if (error) {
    log.warn('[account-albion] duplicate claim lookup failed', {
      player_id: playerId,
      server,
      error: error.message,
    })
    return false
  }
  return (data ?? []).length > 0
}

function parseRoleIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0)
  } catch {
    return []
  }
}

async function loadEffectiveMemberRoleIds(guildId: string): Promise<{
  discordGuildId: string | null
  trustedRoleIds: string[]
}> {
  const tenantConfig = await getTenantDiscordConfig(guildId)
  if (!tenantConfig) return { discordGuildId: null, trustedRoleIds: [] }
  const activeMemberRoleIds = parseRoleIds(
    await getAppSetting('active_member_role_ids', '[]', guildId),
  )
  const memberRoleIds =
    activeMemberRoleIds.length > 0 ? activeMemberRoleIds : tenantConfig.memberRoleIds
  return {
    discordGuildId: tenantConfig.discordGuildId,
    trustedRoleIds: [...new Set([...memberRoleIds, ...tenantConfig.adminRoleIds])],
  }
}

async function hasTrustedMemberRole(guildId: string, discordId: string): Promise<boolean> {
  const { discordGuildId, trustedRoleIds } = await loadEffectiveMemberRoleIds(guildId)
  if (!discordGuildId || trustedRoleIds.length === 0) return false
  try {
    const member = await getGuildMemberByBot(discordGuildId, discordId)
    if (!member) return false
    const roleSet = new Set(member.roles)
    return trustedRoleIds.some((roleId) => roleSet.has(roleId))
  } catch (e) {
    log.warn('[account-albion] trusted member role lookup failed', {
      guild_id: guildId,
      discord_id: discordId,
      error: e instanceof Error ? e.message : String(e),
    })
    return false
  }
}

async function upsertAccountProfile(input: {
  discordId: string
  server: AlbionServer
  playerId: string | null
  playerName: string
  currentGuildId: string | null
  currentGuildName: string | null
  currentAllianceId: string | null
  currentAllianceName: string | null
  source: ClaimInput['source']
  verifiedAt: string | null
  nowIso: string
}): Promise<string | null> {
  const db = getAdminClient()
  const row = {
    discord_id: input.discordId,
    albion_server: input.server,
    albion_player_id: input.playerId,
    albion_player_name: input.playerName,
    current_guild_id: input.currentGuildId,
    current_guild_name: input.currentGuildName,
    current_alliance_id: input.currentAllianceId,
    current_alliance_name: input.currentAllianceName,
    is_primary: true,
    claim_status: 'claimed',
    source: input.source,
    verified_at: input.verifiedAt,
    revoked_at: null,
    last_synced_at: input.playerId ? input.nowIso : null,
    updated_at: input.nowIso,
  }

  let existingId: string | null = null
  if (input.playerId) {
    const { data, error } = await db
      .from('account_albion_profiles')
      .select('id')
      .eq('discord_id', input.discordId)
      .eq('albion_server', input.server)
      .eq('albion_player_id', input.playerId)
      .maybeSingle()
    if (isMissingAccountTable(error)) return null
    if (error) {
      log.warn('[account-albion] profile lookup failed', {
        discord_id: input.discordId,
        player_id: input.playerId,
        error: error.message,
      })
    }
    existingId = (data?.id as string | undefined) ?? null
  } else {
    const { data, error } = await db
      .from('account_albion_profiles')
      .select('id')
      .eq('discord_id', input.discordId)
      .eq('albion_server', input.server)
      .eq('albion_player_name', input.playerName)
      .is('albion_player_id', null)
      .maybeSingle()
    if (isMissingAccountTable(error)) return null
    if (error) {
      log.warn('[account-albion] manual profile lookup failed', {
        discord_id: input.discordId,
        player_name: input.playerName,
        error: error.message,
      })
    }
    existingId = (data?.id as string | undefined) ?? null
  }

  const write = existingId
    ? db.from('account_albion_profiles').update(row).eq('id', existingId).select('id').single()
    : db.from('account_albion_profiles').insert(row).select('id').single()
  const { data, error } = await write
  if (isMissingAccountTable(error)) return null
  if (error) {
    log.error('[account-albion] profile upsert failed', error, {
      discord_id: input.discordId,
      player_id: input.playerId,
    })
    return null
  }

  const profileId = data?.id as string | undefined
  if (profileId) {
    await db
      .from('account_albion_profiles')
      .update({ is_primary: false, updated_at: input.nowIso })
      .eq('discord_id', input.discordId)
      .neq('id', profileId)
      .is('revoked_at', null)
  }
  return profileId ?? null
}

async function writeIdentityAudit(input: {
  guildId: string
  discordId: string
  profileId: string
  action: string
  trustStatus: AlbionIdentityTrustStatus
  relation: AlbionIdentityRelation
  reason: string
}): Promise<void> {
  const { error } = await getAdminClient().from('account_albion_identity_audit').insert({
    guild_id: input.guildId,
    discord_id: input.discordId,
    profile_id: input.profileId,
    actor_discord_id: input.discordId,
    action: input.action,
    trust_status: input.trustStatus,
    relation: input.relation,
    reason: input.reason,
  })
  if (error && !isMissingAccountTable(error)) {
    log.warn('[account-albion] audit insert failed', {
      guild_id: input.guildId,
      discord_id: input.discordId,
      error: error.message,
    })
  }
}

function statusReasonFor(
  trustStatus: AlbionIdentityTrustStatus,
  relation: AlbionIdentityRelation,
  opts: {
    legacyTrusted: boolean
    adminApprovedTrusted?: boolean
    hasTrustedDiscordMemberRole: boolean
  },
): string {
  if (trustStatus === 'disputed') return 'duplicate_claim'
  if (trustStatus === 'trusted') {
    if (opts.adminApprovedTrusted) return 'admin_approved'
    return opts.hasTrustedDiscordMemberRole ? 'discord_role_and_roster_match' : 'legacy_trusted'
  }
  if (trustStatus === 'roster_matched') {
    return relation === 'alliance' ? 'alliance_match' : 'roster_match'
  }
  if (trustStatus === 'revoked') return 'revoked'
  return 'claimed'
}

export function isMissingAccountAlbionTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false
  if (error.code && ACCOUNT_TABLE_MISSING_CODES.has(error.code)) return true
  return typeof error.message === 'string' && error.message.includes('account_albion_')
}

function isMissingAccountTable(error: { code?: string; message?: string } | null): boolean {
  return isMissingAccountAlbionTable(error)
}

export function isAlbionIdentityRelation(value: unknown): value is AlbionIdentityRelation {
  return (
    value === 'home_guild' ||
    value === 'alliance' ||
    value === 'external' ||
    value === 'unknown'
  )
}

function isAlbionIdentityTrustStatus(value: unknown): value is AlbionIdentityTrustStatus {
  return (
    value === 'claimed' ||
    value === 'roster_matched' ||
    value === 'trusted' ||
    value === 'disputed' ||
    value === 'revoked'
  )
}
