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
import { listGuildMembersBulk } from '@/lib/discord'

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

function parseEnvRoleIds(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
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

  const activeRoleIdsRaw = await getAppSetting('active_member_role_ids', '[]', guildId)
  const explicitRoleIds = parseRoleIds(activeRoleIdsRaw)
  const envFallbackRoleIds = parseEnvRoleIds(process.env.DISCORD_MEMBER_ROLE_ID)
  const activeRoleIds = explicitRoleIds.length > 0 ? explicitRoleIds : envFallbackRoleIds
  const rolesSource: RolesSource =
    explicitRoleIds.length > 0
      ? 'explicit'
      : envFallbackRoleIds.length > 0
        ? 'env_fallback'
        : 'server_only'

  const { data: avatars, error: avatarsError } = await db
    .from('guild_avatars')
    .select('discord_id, withdrawn_at')
    .eq('guild_id', guildId)
  if (avatarsError) return { kind: 'error', message: avatarsError.message }

  let members: Awaited<ReturnType<typeof listGuildMembersBulk>>
  try {
    members = await listGuildMembersBulk()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[member-sync] bulk fetch failed:', msg)
    return { kind: 'error', message: msg }
  }

  const memberRoles = new Map<string, string[]>()
  for (const m of members) {
    if (!m.user) continue
    memberRoles.set(m.user.id, m.roles)
  }

  const toWithdraw: string[] = []
  const toRejoin: string[] = []
  for (const row of avatars ?? []) {
    const roles = memberRoles.get(row.discord_id)
    const inServer = !!roles
    const hasActiveRole =
      activeRoleIds.length === 0 ? true : activeRoleIds.some((id) => roles?.includes(id) ?? false)
    const isActive = inServer && hasActiveRole
    const wasActive = row.withdrawn_at === null

    if (isActive && !wasActive) toRejoin.push(row.discord_id)
    else if (!isActive && wasActive) toWithdraw.push(row.discord_id)
  }

  if (toWithdraw.length > 0) {
    const { error: updErr } = await db
      .from('guild_avatars')
      .update({ withdrawn_at: nowIso })
      .eq('guild_id', guildId)
      .in('discord_id', toWithdraw)
    if (updErr) console.error('[member-sync] withdraw update failed:', updErr.message)
  }
  if (toRejoin.length > 0) {
    const { error: updErr } = await db
      .from('guild_avatars')
      .update({ withdrawn_at: null })
      .eq('guild_id', guildId)
      .in('discord_id', toRejoin)
    if (updErr) console.error('[member-sync] rejoin update failed:', updErr.message)
  }

  await db
    .from('app_settings')
    .upsert(
      { guild_id: guildId, key: 'last_member_sync_at', value: nowIso, updated_at: nowIso },
      { onConflict: 'guild_id,key' },
    )

  if (toWithdraw.length > 0 || toRejoin.length > 0) {
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
    },
  }
}
