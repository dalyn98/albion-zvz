// Discord 길드 멤버 목록을 읽어 "탈퇴한 사용자" 플래그를 갱신하는 핵심 로직.
//
// 두 곳에서 호출됨:
//   1. /api/cron/member-sync — GitHub Actions 에서 매일 1회 (CRON_SECRET gate)
//   2. 관리자 설정 UI 수동 실행 버튼 (admin session gate + skipThrottle)
//
// 탈퇴 판정 규칙과 활동 역할 fallback 은 route.ts 의 주석 참조.

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { revalidateAppSettingsCache } from '@/lib/app-settings-invalidation'
import { listGuildMembersBulk } from '@/lib/discord'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { log } from '@/lib/log'
import {
  canUseAllianceEventFeatures,
  type AlbionIdentityRelation,
  type AlbionIdentityTrustStatus,
} from '@/lib/account-albion-identity'
import { applySiteNicknameOverride } from '@/lib/site-nickname'
import { listSiteNicknameOverridesByDiscordIds } from '@/lib/site-nickname-override'

// 직전 성공 후 20시간 내면 skip — cron 재시도가 하루 2회 이상 돌지 않게 수렴.
// KST 04:00 스케줄이 약간 앞당겨져도 다음날 실행이 건너뛰지 않도록 20h.
export const MIN_SYNC_INTERVAL_MS = 20 * 60 * 60 * 1000

export type RolesSource = 'explicit' | 'env_fallback' | 'server_only'

export interface MemberSyncResult {
  scanned: number
  discordMembers: number
  activeRoleIdsCount: number
  rolesSource: RolesSource
  withdrawn: number
  rejoined: number
  adminUpdated: number
  bombSquadCallerUpdated: number
}

export type MemberSyncOutcome =
  | { kind: 'ok'; result: MemberSyncResult }
  | { kind: 'throttled'; lastSyncAt: string }
  | { kind: 'error'; message: string }

function parseRoleIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0)
  } catch {
    return []
  }
}

function displayNameFromDiscordMember(member: {
  user: { username: string; global_name?: string | null } | null
  nick: string | null
}): string {
  return member.nick || member.user?.global_name || member.user?.username || 'Unknown'
}

interface RunOptions {
  skipThrottle?: boolean
}

export async function runMemberSync(
  guildId: string,
  opts: RunOptions = {},
): Promise<MemberSyncOutcome> {
  const db = getAdminClient()
  const nowIso = new Date().toISOString()

  if (!opts.skipThrottle) {
    const lastAt = await getAppSetting('last_member_sync_at', '', guildId)
    if (lastAt) {
      const lastMs = Date.parse(lastAt)
      if (Number.isFinite(lastMs) && Date.now() - lastMs < MIN_SYNC_INTERVAL_MS) {
        return { kind: 'throttled', lastSyncAt: lastAt }
      }
    }
  }

  const tenantConfig = await getTenantDiscordConfig(guildId)
  if (!tenantConfig) return { kind: 'error', message: 'Tenant not found' }

  const activeRoleIdsRaw = await getAppSetting('active_member_role_ids', '[]', guildId)
  const bombSquadCallerRoleIdsRaw = await getAppSetting('bomb_squad_caller_role_ids', '[]', guildId)
  const explicitRoleIds = parseRoleIds(activeRoleIdsRaw)
  const bombSquadCallerRoleIds = parseRoleIds(bombSquadCallerRoleIdsRaw)
  // env 폴백 제거 — 대신 tenant.member_role_ids (마이그 074 에 시드됨) 를 사용.
  // 신규 tenant 는 반드시 tenants.member_role_ids 가 채워진 상태여야 동작.
  const tenantMemberRoleIds = tenantConfig.memberRoleIds
  const activeRoleIds = explicitRoleIds.length > 0 ? explicitRoleIds : tenantMemberRoleIds
  const rolesSource: RolesSource =
    explicitRoleIds.length > 0
      ? 'explicit'
      : tenantMemberRoleIds.length > 0
        ? 'env_fallback'
        : 'server_only'

  const [
    { data: avatars, error: avatarsError },
    { data: adminOverrides, error: overrideError },
    { data: accountLinks, error: accountLinksError },
  ] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id, withdrawn_at, is_admin, is_bomb_squad_caller')
      .eq('guild_id', guildId),
    db.from('tenant_admin_overrides').select('discord_id').eq('tenant_id', guildId),
    db
      .from('account_albion_tenant_links')
      .select('discord_id, relation, trust_status')
      .eq('guild_id', guildId),
  ])
  if (overrideError) return { kind: 'error', message: overrideError.message }
  if (accountLinksError) return { kind: 'error', message: accountLinksError.message }
  if (avatarsError) return { kind: 'error', message: avatarsError.message }

  const adminOverrideIds = new Set((adminOverrides ?? []).map((r) => r.discord_id as string))
  const allianceEventParticipantIds = new Set(
    (accountLinks ?? [])
      .filter((row) =>
        canUseAllianceEventFeatures({
          relation: row.relation as AlbionIdentityRelation,
          trustStatus: row.trust_status as AlbionIdentityTrustStatus,
        }),
      )
      .map((row) => row.discord_id as string),
  )

  let members: Awaited<ReturnType<typeof listGuildMembersBulk>>
  try {
    members = await listGuildMembersBulk(tenantConfig.discordGuildId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.error('[member-sync] bulk fetch failed', e, {
      tenant_id: guildId,
      discord_guild_id: tenantConfig.discordGuildId,
    })
    return { kind: 'error', message: msg }
  }

  const memberRoles = new Map<string, string[]>()
  for (const m of members) {
    if (!m.user) continue
    memberRoles.set(m.user.id, m.roles)
  }

  const existingAvatarIds = new Set((avatars ?? []).map((row) => row.discord_id as string))
  const callerRowsBase = members
    .filter((m) => {
      if (!m.user || existingAvatarIds.has(m.user.id)) return false
      return bombSquadCallerRoleIds.some((id) => m.roles.includes(id))
    })
    .map((m) => ({
      guild_id: guildId,
      discord_id: m.user!.id,
      username: displayNameFromDiscordMember(m),
      avatar: m.user!.avatar,
      is_admin: false,
      is_bomb_squad_caller: true,
      withdrawn_at: null,
      updated_at: nowIso,
    }))
  const callerNicknameOverrides = await listSiteNicknameOverridesByDiscordIds(
    callerRowsBase.map((row) => row.discord_id),
  )
  const callerRowsToUpsert = callerRowsBase.map((row) => ({
    ...row,
    username: applySiteNicknameOverride(row.username, callerNicknameOverrides.get(row.discord_id)),
  }))

  const toWithdraw: string[] = []
  const toRejoin: string[] = []
  const toAdminTrue: string[] = []
  const toAdminFalse: string[] = []
  const toCallerTrue: string[] = []
  const toCallerFalse: string[] = []
  for (const row of avatars ?? []) {
    const roles = memberRoles.get(row.discord_id)
    const inServer = !!roles
    const hasAdminRole = tenantConfig.adminRoleIds.some((id) => roles?.includes(id) ?? false)
    const isTenantOwner = tenantConfig.createdByDiscordId === row.discord_id
    const hasAdminOverride = adminOverrideIds.has(row.discord_id)
    const shouldBeAdmin = inServer && (hasAdminRole || isTenantOwner || hasAdminOverride)
    const shouldBeBombSquadCaller =
      inServer && bombSquadCallerRoleIds.some((id) => roles?.includes(id) ?? false)
    const isAllianceEventParticipant = allianceEventParticipantIds.has(row.discord_id)
    const hasActiveRole =
      activeRoleIds.length === 0 ? true : activeRoleIds.some((id) => roles?.includes(id) ?? false)
    // 로그인 판정과 맞춘다: 관리자/테넌트 소유자는 멤버 역할을 겸한다.
    const isActive =
      inServer &&
      (hasActiveRole || shouldBeAdmin || shouldBeBombSquadCaller || isAllianceEventParticipant)
    const wasActive = row.withdrawn_at === null

    if (isActive && !wasActive) toRejoin.push(row.discord_id)
    else if (!isActive && wasActive) toWithdraw.push(row.discord_id)
    if (shouldBeAdmin && row.is_admin !== true) toAdminTrue.push(row.discord_id)
    else if (!shouldBeAdmin && row.is_admin === true) toAdminFalse.push(row.discord_id)
    if (shouldBeBombSquadCaller && row.is_bomb_squad_caller !== true) {
      toCallerTrue.push(row.discord_id)
    } else if (!shouldBeBombSquadCaller && row.is_bomb_squad_caller === true) {
      toCallerFalse.push(row.discord_id)
    }
  }

  if (toWithdraw.length > 0) {
    const { error: updErr } = await db
      .from('guild_avatars')
      .update({ withdrawn_at: nowIso })
      .eq('guild_id', guildId)
      .in('discord_id', toWithdraw)
    if (updErr) {
      log.error('[member-sync] withdraw update failed', updErr, {
        tenant_id: guildId,
        count: toWithdraw.length,
      })
    }
  }
  if (toRejoin.length > 0) {
    const { error: updErr } = await db
      .from('guild_avatars')
      .update({ withdrawn_at: null })
      .eq('guild_id', guildId)
      .in('discord_id', toRejoin)
    if (updErr) {
      log.error('[member-sync] rejoin update failed', updErr, {
        tenant_id: guildId,
        count: toRejoin.length,
      })
    }
  }
  if (toAdminTrue.length > 0) {
    const { error } = await db
      .from('guild_avatars')
      .update({ is_admin: true })
      .eq('guild_id', guildId)
      .in('discord_id', toAdminTrue)
    if (error) return { kind: 'error', message: error.message }
  }
  if (toAdminFalse.length > 0) {
    const { error } = await db
      .from('guild_avatars')
      .update({ is_admin: false })
      .eq('guild_id', guildId)
      .in('discord_id', toAdminFalse)
    if (error) return { kind: 'error', message: error.message }
  }
  if (toCallerTrue.length > 0) {
    const { error } = await db
      .from('guild_avatars')
      .update({ is_bomb_squad_caller: true })
      .eq('guild_id', guildId)
      .in('discord_id', toCallerTrue)
    if (error) return { kind: 'error', message: error.message }
  }
  if (toCallerFalse.length > 0) {
    const { error } = await db
      .from('guild_avatars')
      .update({ is_bomb_squad_caller: false })
      .eq('guild_id', guildId)
      .in('discord_id', toCallerFalse)
    if (error) return { kind: 'error', message: error.message }
  }
  if (callerRowsToUpsert.length > 0) {
    const { error } = await db
      .from('guild_avatars')
      .upsert(callerRowsToUpsert, { onConflict: 'guild_id,discord_id' })
    if (error) return { kind: 'error', message: error.message }
  }

  const { error: timestampError } = await db
    .from('app_settings')
    .upsert(
      { guild_id: guildId, key: 'last_member_sync_at', value: nowIso, updated_at: nowIso },
      { onConflict: 'guild_id,key' },
    )
  if (!timestampError) revalidateAppSettingsCache(guildId)

  const adminUpdated = toAdminTrue.length + toAdminFalse.length
  const bombSquadCallerUpdated =
    toCallerTrue.length + toCallerFalse.length + callerRowsToUpsert.length
  if (
    toWithdraw.length > 0 ||
    toRejoin.length > 0 ||
    adminUpdated > 0 ||
    bombSquadCallerUpdated > 0
  ) {
    revalidatePath('/members')
    revalidatePath('/admin/dashboard/stats')
    revalidatePath('/admin/dashboard/settings')
  }

  return {
    kind: 'ok',
    result: {
      scanned: avatars?.length ?? 0,
      discordMembers: memberRoles.size,
      activeRoleIdsCount: activeRoleIds.length,
      rolesSource,
      withdrawn: toWithdraw.length,
      rejoined: toRejoin.length,
      adminUpdated,
      bombSquadCallerUpdated,
    },
  }
}
