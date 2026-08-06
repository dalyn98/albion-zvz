'use server'

// 슈퍼어드민 mutation server actions.
//
// 모든 액션은 requireSuperAdmin() 으로 가드되며, 성공 시 audit log 에 자동 기록.
// 실패는 throw 로 통보 (호출부 form 이 error.tsx 로 위임).

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath, updateTag } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireSuperAdmin } from '@/lib/super-admin'
import { logSuperAdminAction } from '@/lib/super-admin-audit'
import {
  SYSTEM_NOTICES_TAG,
  isSystemNoticePurpose,
  isSystemNoticeSeverity,
} from '@/lib/super-admin-notices'
import { getSuperAdminPath } from '@/lib/super-admin-path'
import { normalizePublicImageUrl } from '@/lib/public-image-url'
import {
  normalizeDiscordId,
  normalizeSiteNickname,
  SITE_NICKNAME_REASON_MAX_LENGTH,
} from '@/lib/site-nickname'
import { executeMemberAccountMerge } from '@/lib/super-admin-account-merge'
import { invalidateTenantDirectoryCache } from '@/lib/tenant-cache'
import { invalidateAppSettingsCache } from '@/lib/app-settings-invalidation'
import { markPublicGuildProfileCacheStale } from '@/lib/guild-profile-cache'
import { isGuildHomeOwnershipReviewAction } from '@/lib/guild-home-ownership-dispute'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import {
  normalizePublicZvzSeasonId,
  normalizePublicZvzUtcDateTimeLocal,
} from '@/lib/public-zvz-record-links'
import { PUBLIC_ZVZ_SEASONS_TAG } from '@/lib/public-zvz-seasons'
import {
  IMPERSONATION_COOKIE_NAME,
  impersonationCookieOptions,
  signImpersonation,
} from '@/lib/super-admin-impersonation'

function revalidateSystemNotices() {
  updateTag(SYSTEM_NOTICES_TAG)
  revalidatePath(`${getSuperAdminPath()}/notices`)
  revalidatePath('/', 'layout')
}

function revalidatePublicZvzSeasons() {
  updateTag(PUBLIC_ZVZ_SEASONS_TAG)
  const basePath = getSuperAdminPath()
  revalidatePath(`${basePath}/zvz-seasons`)
  revalidatePath('/zvz-battles')
  revalidatePath('/public/zvz-battles')
}

const VALID_STATUSES = ['active', 'suspended'] as const
type TenantStatus = (typeof VALID_STATUSES)[number]

function isValidStatus(s: string): s is TenantStatus {
  return (VALID_STATUSES as readonly string[]).includes(s)
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string')))
}

export async function setTenantStatus(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const tenantId = String(formData.get('tenantId') ?? '').trim()
  const next = String(formData.get('status') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim() || null

  if (!tenantId) throw new Error('tenantId is required')
  if (!isValidStatus(next)) throw new Error(`invalid status: ${next}`)

  const db = getAdminClient()
  const { data: prev } = await db
    .from('tenants')
    .select('status,lifecycle_reason')
    .eq('id', tenantId)
    .maybeSingle()
  const prevStatus = (prev?.status as string | undefined) ?? null

  const { error } = await db.rpc('set_tenant_policy_suspension', {
    p_guild_id: tenantId,
    p_suspended: next === 'suspended',
    p_actor_discord_id: session.discordId,
  })
  if (error) throw new Error(`policy status command failed: ${error.message}`)
  invalidateTenantDirectoryCache()

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'tenant.status.update',
    targetTenantId: tenantId,
    details: {
      from: prevStatus,
      fromReason: prev?.lifecycle_reason ?? null,
      to: next,
      reason,
    },
  })

  const basePath = getSuperAdminPath()
  revalidatePath(`${basePath}/tenants`)
  revalidatePath(`${basePath}/tenants/${tenantId}`)
}

export async function reviewGuildHomeOwnershipDispute(
  formData: FormData,
): Promise<void> {
  const session = await requireSuperAdmin()
  const disputeId = String(formData.get('disputeId') ?? '').trim()
  const action = String(formData.get('reviewAction') ?? '').trim()
  const resolutionNote = String(formData.get('resolutionNote') ?? '').trim()
  const confirmation = String(formData.get('confirmation') ?? '').trim()

  if (!disputeId) throw new Error('disputeId is required')
  if (!isGuildHomeOwnershipReviewAction(action)) {
    throw new Error('invalid ownership dispute action')
  }
  if (action !== 'start_review' && resolutionNote.length < 10) {
    throw new Error('resolution note must be at least 10 characters')
  }
  if (action === 'reassign' && confirmation !== `REASSIGN ${disputeId}`) {
    throw new Error(`type REASSIGN ${disputeId} to confirm reassignment`)
  }

  const db = getAdminClient()
  const { data, error } = await db.rpc(
    'review_guild_home_ownership_dispute',
    {
      p_dispute_id: disputeId,
      p_action: action,
      p_reviewer_discord_id: session.discordId,
      p_resolution_note: resolutionNote,
    },
  )
  if (error) throw new Error(`ownership dispute command failed: ${error.message}`)

  const result = (data ?? {}) as {
    status?: string
    incumbentGuildId?: string
    claimantGuildId?: string
    changed?: boolean
    homeGuildReassigned?: boolean
  }
  for (const guildId of [result.incumbentGuildId, result.claimantGuildId]) {
    if (!guildId) continue
    markPublicGuildProfileCacheStale(guildId)
    if (result.homeGuildReassigned) invalidateAppSettingsCache(guildId)
  }
  if (result.homeGuildReassigned) invalidateTenantDirectoryCache()

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: action === 'start_review'
      ? 'guild.home-ownership.review'
      : 'guild.home-ownership.resolve',
    targetTenantId: result.incumbentGuildId ?? null,
    details: {
      disputeId,
      reviewAction: action,
      status: result.status ?? null,
      claimantGuildId: result.claimantGuildId ?? null,
      changed: result.changed === true,
      homeGuildReassigned: result.homeGuildReassigned === true,
      resolutionNote: resolutionNote || null,
    },
  })

  const basePath = getSuperAdminPath()
  revalidatePath(`${basePath}/ownership-disputes`)
  revalidatePath(`${basePath}/audit`)
  revalidatePath('/public/g/[slug]', 'page')
  revalidatePath('/sitemap.xml')
}

export async function grantTenantAdmin(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const tenantId = String(formData.get('tenantId') ?? '').trim()
  const discordId = String(formData.get('discordId') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim() || null

  if (!tenantId) throw new Error('tenantId is required')
  if (!discordId) throw new Error('discordId is required')
  if (!/^\d{15,25}$/.test(discordId)) throw new Error('discordId must be a numeric snowflake')

  const db = getAdminClient()
  const { error } = await db.from('tenant_admin_overrides').upsert(
    {
      tenant_id: tenantId,
      discord_id: discordId,
      granted_by_discord_id: session.discordId,
      reason,
    },
    { onConflict: 'tenant_id,discord_id' },
  )
  if (error) throw new Error(`grant failed: ${error.message}`)

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'tenant.admin.grant',
    targetTenantId: tenantId,
    targetDiscordId: discordId,
    details: { reason },
  })

  revalidatePath(`${getSuperAdminPath()}/tenants/${tenantId}`)
}

export async function createSystemNotice(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const message = String(formData.get('message') ?? '').trim()
  const rawImageUrl = String(formData.get('imageUrl') ?? '').trim()
  const imageUrl = rawImageUrl ? normalizePublicImageUrl(rawImageUrl) : null
  const expiresAtRaw = String(formData.get('expiresAt') ?? '').trim()
  const purpose = String(formData.get('purpose') ?? '').trim()
  const severity = String(formData.get('severity') ?? '').trim()

  if (rawImageUrl && !imageUrl) throw new Error('imageUrl must be a valid https URL')
  if (!message && !imageUrl) throw new Error('message or imageUrl required')
  if (!isSystemNoticePurpose(purpose)) throw new Error('invalid notice purpose')
  if (!isSystemNoticeSeverity(severity)) throw new Error('invalid notice severity')

  if (!expiresAtRaw) throw new Error('expiresAt is required')
  const parsed = new Date(expiresAtRaw)
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid expiresAt')
  if (parsed.getTime() <= Date.now()) throw new Error('expiresAt must be in the future')
  const expiresAt = parsed.toISOString()

  const db = getAdminClient()
  const { error } = await db.rpc('replace_super_admin_notice', {
    p_message: message,
    p_image_url: imageUrl,
    p_expires_at: expiresAt,
    p_purpose: purpose,
    p_severity: severity,
    p_actor_discord_id: session.discordId,
  })
  if (error) throw new Error(`notice command failed: ${error.message}`)

  revalidateSystemNotices()
}

export async function updateSiteNicknameOverride(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const discordId = normalizeDiscordId(String(formData.get('discordId') ?? ''))
  const nickname = normalizeSiteNickname(String(formData.get('nickname') ?? ''))
  const reasonRaw = String(formData.get('reason') ?? '').trim()
  const reason = reasonRaw.length > 0 ? reasonRaw : null

  if (!discordId) throw new Error('discordId must be a numeric snowflake')
  if (!nickname) throw new Error('nickname must be 1-32 chars without control characters')
  if (reason && reason.length > SITE_NICKNAME_REASON_MAX_LENGTH) {
    throw new Error(`reason must be ${SITE_NICKNAME_REASON_MAX_LENGTH} chars or less`)
  }

  const db = getAdminClient()
  const nowIso = new Date().toISOString()
  const [prevOverrideResult, memberRowsResult, guestRowsResult] = await Promise.all([
    db
      .from('site_user_nickname_overrides')
      .select('nickname, updated_by_discord_id, reason, updated_at')
      .eq('discord_id', discordId)
      .maybeSingle(),
    db.from('guild_avatars').select('guild_id, username').eq('discord_id', discordId),
    db.from('guests').select('guild_id, username').eq('discord_id', discordId),
  ])

  if (prevOverrideResult.error) {
    throw new Error(`previous override lookup failed: ${prevOverrideResult.error.message}`)
  }
  if (memberRowsResult.error) {
    throw new Error(`member lookup failed: ${memberRowsResult.error.message}`)
  }
  if (guestRowsResult.error) {
    throw new Error(`guest lookup failed: ${guestRowsResult.error.message}`)
  }

  const { error: upsertError } = await db.from('site_user_nickname_overrides').upsert(
    {
      discord_id: discordId,
      nickname,
      updated_by_discord_id: session.discordId,
      reason,
      updated_at: nowIso,
    },
    { onConflict: 'discord_id' },
  )
  if (upsertError) throw new Error(`nickname override upsert failed: ${upsertError.message}`)

  const [memberUpdateResult, guestUpdateResult] = await Promise.all([
    db
      .from('guild_avatars')
      .update({ username: nickname, updated_at: nowIso })
      .eq('discord_id', discordId),
    db.from('guests').update({ username: nickname }).eq('discord_id', discordId),
  ])
  if (memberUpdateResult.error) {
    throw new Error(`member username update failed: ${memberUpdateResult.error.message}`)
  }
  if (guestUpdateResult.error) {
    throw new Error(`guest username update failed: ${guestUpdateResult.error.message}`)
  }

  const memberRows = (memberRowsResult.data ?? []) as Array<{
    guild_id: string | null
    username: string | null
  }>
  const guestRows = (guestRowsResult.data ?? []) as Array<{
    guild_id: string | null
    username: string | null
  }>
  const affectedTenantIds = uniqueStrings([
    ...memberRows.map((row) => row.guild_id),
    ...guestRows.map((row) => row.guild_id),
  ])
  const previousUsernames = uniqueStrings([
    ...memberRows.map((row) => row.username),
    ...guestRows.map((row) => row.username),
  ]).slice(0, 20)

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'user.nickname.update',
    targetDiscordId: discordId,
    details: {
      from: prevOverrideResult.data?.nickname ?? null,
      to: nickname,
      reason,
      affectedTenantIds,
      affectedMemberRows: memberRows.length,
      affectedGuestRows: guestRows.length,
      previousUsernames,
    },
  })

  const basePath = getSuperAdminPath()
  revalidatePath(`${basePath}/users`)
  revalidatePath(`${basePath}/audit`)
  revalidatePath('/members')
  revalidatePath('/', 'layout')
  redirect(`${basePath}/users?discordId=${encodeURIComponent(discordId)}`)
}

export async function mergeMemberAccountsAction(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const tenantId = String(formData.get('tenantId') ?? '').trim()
  const fromDiscordId = String(formData.get('fromDiscordId') ?? '').trim()
  const toDiscordId = String(formData.get('toDiscordId') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()
  const confirmation = String(formData.get('confirmation') ?? '').trim()

  const result = await executeMemberAccountMerge(getAdminClient(), {
    guildId: tenantId,
    fromDiscordId,
    toDiscordId,
    actorDiscordId: session.discordId,
    reason,
    confirmation,
  })
  if (!result.ok) throw new Error(result.error)

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'user.account.merge',
    targetTenantId: tenantId,
    targetDiscordId: toDiscordId,
    details: {
      fromDiscordId,
      toDiscordId,
      reason: reason || null,
      moved: result.result.moved,
      warnings: result.result.warnings,
      source: result.result.source,
      target: result.result.target,
    },
  })

  const basePath = getSuperAdminPath()
  revalidatePath(`${basePath}/account-merge`)
  revalidatePath(`${basePath}/users`)
  revalidatePath(`${basePath}/audit`)
  revalidatePath('/members')
  revalidatePath('/me')
  revalidatePath('/', 'layout')

  const params = new URLSearchParams({
    tenantId,
    fromDiscordId,
    toDiscordId,
    merged: '1',
  })
  redirect(`${basePath}/account-merge?${params.toString()}`)
}

export async function startImpersonation(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const tenantId = String(formData.get('tenantId') ?? '').trim()
  if (!tenantId) throw new Error('tenantId is required')

  // 존재하는 테넌트인지 확인 — 잘못된 ID 로 임퍼소네이션 시 모든 페이지가
  // 깨질 수 있으므로 미리 검증.
  const db = getAdminClient()
  const { data } = await db.from('tenants').select('id, slug, name').eq('id', tenantId).maybeSingle()
  if (!data) throw new Error('tenant not found')

  const cookie = await signImpersonation(tenantId)
  const store = await cookies()
  store.set(IMPERSONATION_COOKIE_NAME, cookie, impersonationCookieOptions())

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'impersonate.start',
    targetTenantId: tenantId,
    details: { slug: data.slug, name: data.name },
  })

  // 임퍼소네이션 시작 후 멤버 메인 페이지로 이동 — 사용자가 보는 화면을 즉시 확인.
  redirect('/')
}

export async function archiveSystemNotice(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const noticeId = String(formData.get('noticeId') ?? '').trim()
  if (!noticeId) throw new Error('noticeId is required')

  const db = getAdminClient()
  const { error } = await db.rpc('archive_super_admin_notice', {
    p_notice_id: noticeId,
    p_actor_discord_id: session.discordId,
  })
  if (error) throw new Error(`notice archive command failed: ${error.message}`)

  revalidateSystemNotices()
}

export interface ManualSyncResult {
  ok: boolean
  battleTracker: { ok: boolean; status: number; bodyPreview: string }
  killboardSync: { ok: boolean; status: number; bodyPreview: string }
  durationMs: number
}

// 전투/킬로그 cron 을 즉시 강제 실행. cron 은 5분 주기지만 "방금 전투했는데 보고 싶다"
// 같은 즉시성 요구를 위한 트리거. 내부적으로 같은 cron 라우트를 Bearer 인증으로 호출해
// 로직 중복을 피한다.
export async function triggerManualSync(): Promise<ManualSyncResult> {
  const session = await requireSuperAdmin()
  const secret = process.env.CRON_SECRET
  const appUrl = process.env.APP_URL
  if (!secret) throw new Error('CRON_SECRET not configured')
  if (!appUrl) throw new Error('APP_URL not configured')

  const headers = { Authorization: `Bearer ${secret}` }
  const startedAt = Date.now()

  // 수동 트리거는 GitHub Actions schedule 이 지연/누락된 케이스를 복구하는 용도라
  // 기본 2페이지(100건, ~10분 커버) 대신 20페이지(1000건, ~80분 커버) 로 깊게 스캔.
  const [battleRes, killRes] = await Promise.all([
    fetch(`${appUrl}/api/cron/battle-tracker?pages=20`, { headers, cache: 'no-store' }),
    fetch(`${appUrl}/api/cron/killboard-sync`, { headers, cache: 'no-store' }),
  ])
  const [battleBody, killBody] = await Promise.all([battleRes.text(), killRes.text()])
  const durationMs = Date.now() - startedAt

  const result: ManualSyncResult = {
    ok: battleRes.ok && killRes.ok,
    battleTracker: {
      ok: battleRes.ok,
      status: battleRes.status,
      bodyPreview: battleBody.slice(0, 500),
    },
    killboardSync: {
      ok: killRes.ok,
      status: killRes.status,
      bodyPreview: killBody.slice(0, 500),
    },
    durationMs,
  }

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'sync.manual',
    details: {
      battleTracker: { ok: result.battleTracker.ok, status: result.battleTracker.status },
      killboardSync: { ok: result.killboardSync.ok, status: result.killboardSync.status },
      durationMs,
    },
  })

  revalidatePath(getSuperAdminPath())
  revalidatePath('/admin/dashboard/stats')
  return result
}

export async function savePublicZvzSeason(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const rawSeasonId = String(formData.get('seasonId') ?? '').trim()
  const seasonId = rawSeasonId ? normalizePublicZvzSeasonId(rawSeasonId) : null
  const server = String(formData.get('server') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const startsAt = normalizePublicZvzUtcDateTimeLocal(
    String(formData.get('startsAt') ?? '').trim(),
  )
  const rawEndsAt = String(formData.get('endsAt') ?? '').trim()
  const endsAt = rawEndsAt
    ? normalizePublicZvzUtcDateTimeLocal(rawEndsAt)
    : null
  const confirmation = String(formData.get('confirmation') ?? '').trim()

  if (rawSeasonId && !seasonId) throw new Error('invalid season id')
  if (!isAlbionServer(server)) throw new Error('invalid Albion server')
  if (!name || name.length > 80) throw new Error('시즌명은 1~80자로 입력하세요.')
  if (!startsAt) throw new Error('올바른 UTC 시작 시각을 입력하세요.')
  if (rawEndsAt && !endsAt) throw new Error('올바른 UTC 종료 시각을 입력하세요.')
  if (endsAt && endsAt <= startsAt) {
    throw new Error('종료 시각은 시작 시각보다 뒤여야 합니다.')
  }
  if (seasonId && confirmation !== 'UPDATE') {
    throw new Error('기존 시즌 경계를 수정하려면 UPDATE를 입력하세요.')
  }

  const db = getAdminClient()
  const { data, error } = await db.rpc('save_public_zvz_season', {
    p_season_id: seasonId,
    p_albion_server: server,
    p_name: name,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_actor_discord_id: session.discordId,
  })
  if (error) throw new Error(`시즌 저장 실패: ${error.message}`)

  const saved = data as {
    season_id?: string
    boundaries_changed?: boolean
  } | null
  const [legacyRebuild, v2Rebuild] = saved?.boundaries_changed
    ? await Promise.all([
        db.rpc('refresh_all_guild_zvz_season_snapshots', {
          p_albion_server: server,
          p_force: true,
        }),
        db.rpc('refresh_all_public_zvz_v2_season_snapshots', {
          p_albion_server: server,
          p_force: true,
        }),
      ])
    : [
        { data: null, error: null },
        { data: null, error: null },
      ]

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: seasonId ? 'zvz.season.update' : 'zvz.season.create',
    details: {
      seasonId: saved?.season_id ?? seasonId,
      server,
      name,
      startsAt,
      endsAt,
      boundariesChanged: saved?.boundaries_changed ?? false,
      rebuildError: legacyRebuild.error?.message ?? v2Rebuild.error?.message ?? null,
      rebuild: {
        legacy: legacyRebuild.data,
        v2: v2Rebuild.data,
      },
    },
  })

  revalidatePublicZvzSeasons()
  if (legacyRebuild.error || v2Rebuild.error) {
    throw new Error(
      `시즌은 저장됐지만 스냅샷 재생성 실패: ${
        legacyRebuild.error?.message ?? v2Rebuild.error?.message
      }`,
    )
  }
}

export async function rebuildPublicZvzSeasonSnapshots(
  formData: FormData,
): Promise<void> {
  const session = await requireSuperAdmin()
  const server = String(formData.get('server') ?? '').trim()
  const confirmation = String(formData.get('confirmation') ?? '').trim()
  if (!isAlbionServer(server)) throw new Error('invalid Albion server')
  if (confirmation !== 'REBUILD') {
    throw new Error('전체 스냅샷을 다시 만들려면 REBUILD를 입력하세요.')
  }

  const db = getAdminClient()
  const [legacyResult, v2Result] = await Promise.all([
    db.rpc('refresh_all_guild_zvz_season_snapshots', {
      p_albion_server: server,
      p_force: true,
    }),
    db.rpc('refresh_all_public_zvz_v2_season_snapshots', {
      p_albion_server: server,
      p_force: true,
    }),
  ])
  if (legacyResult.error || v2Result.error) {
    throw new Error(
      `시즌 스냅샷 재생성 실패: ${
        legacyResult.error?.message ?? v2Result.error?.message
      }`,
    )
  }

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'zvz.season.rebuild',
    details: {
      server,
      result: {
        legacy: legacyResult.data,
        v2: v2Result.data,
      },
    },
  })
  revalidatePublicZvzSeasons()
}

export async function revokeTenantAdmin(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const tenantId = String(formData.get('tenantId') ?? '').trim()
  const discordId = String(formData.get('discordId') ?? '').trim()

  if (!tenantId) throw new Error('tenantId is required')
  if (!discordId) throw new Error('discordId is required')

  const db = getAdminClient()
  const { error } = await db
    .from('tenant_admin_overrides')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('discord_id', discordId)
  if (error) throw new Error(`revoke failed: ${error.message}`)

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'tenant.admin.revoke',
    targetTenantId: tenantId,
    targetDiscordId: discordId,
  })

  revalidatePath(`${getSuperAdminPath()}/tenants/${tenantId}`)
}
