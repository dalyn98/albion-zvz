'use server'

// 슈퍼어드민 mutation server actions.
//
// 모든 액션은 requireSuperAdmin() 으로 가드되며, 성공 시 audit log 에 자동 기록.
// 실패는 throw 로 통보 (호출부 form 이 error.tsx 로 위임).

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireSuperAdmin } from '@/lib/super-admin'
import { logSuperAdminAction } from '@/lib/super-admin-audit'
import {
  IMPERSONATION_COOKIE_NAME,
  impersonationCookieOptions,
  signImpersonation,
} from '@/lib/super-admin-impersonation'

const VALID_STATUSES = ['active', 'pending', 'suspended', 'deleted'] as const
type TenantStatus = (typeof VALID_STATUSES)[number]

function isValidStatus(s: string): s is TenantStatus {
  return (VALID_STATUSES as readonly string[]).includes(s)
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
    .select('status')
    .eq('id', tenantId)
    .maybeSingle()
  const prevStatus = (prev?.status as string | undefined) ?? null

  const { error } = await db
    .from('tenants')
    .update({ status: next })
    .eq('id', tenantId)
  if (error) throw new Error(`status update failed: ${error.message}`)

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'tenant.status.update',
    targetTenantId: tenantId,
    details: { from: prevStatus, to: next, reason },
  })

  revalidatePath('/super-admin/tenants')
  revalidatePath(`/super-admin/tenants/${tenantId}`)
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

  revalidatePath(`/super-admin/tenants/${tenantId}`)
}

export async function createSystemNotice(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const message = String(formData.get('message') ?? '').trim()
  const imageUrl = String(formData.get('imageUrl') ?? '').trim() || null
  const expiresAtRaw = String(formData.get('expiresAt') ?? '').trim()

  if (!message && !imageUrl) throw new Error('message or imageUrl required')

  let expiresAt: string | null = null
  if (expiresAtRaw) {
    const parsed = new Date(expiresAtRaw)
    if (Number.isNaN(parsed.getTime())) throw new Error('invalid expiresAt')
    expiresAt = parsed.toISOString()
  }

  const db = getAdminClient()
  const { data, error } = await db
    .from('super_admin_notices')
    .insert({
      message: message || '',
      image_url: imageUrl,
      expires_at: expiresAt,
      created_by_discord_id: session.discordId,
    })
    .select('id')
    .single()
  if (error) throw new Error(`notice insert failed: ${error.message}`)

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'notice.create',
    details: { id: data?.id, message, imageUrl, expiresAt },
  })

  revalidatePath('/super-admin/notices')
  revalidatePath('/', 'layout')
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

export async function endImpersonation(): Promise<void> {
  const session = await requireSuperAdmin()
  const store = await cookies()
  const existing = store.get(IMPERSONATION_COOKIE_NAME)?.value
  store.delete(IMPERSONATION_COOKIE_NAME)

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'impersonate.end',
    details: { hadCookie: !!existing },
  })

  redirect('/super-admin/tenants')
}

export async function archiveSystemNotice(formData: FormData): Promise<void> {
  const session = await requireSuperAdmin()
  const noticeId = String(formData.get('noticeId') ?? '').trim()
  if (!noticeId) throw new Error('noticeId is required')

  const db = getAdminClient()
  const { error } = await db
    .from('super_admin_notices')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', noticeId)
  if (error) throw new Error(`notice archive failed: ${error.message}`)

  await logSuperAdminAction({
    superAdminDiscordId: session.discordId,
    action: 'notice.archive',
    details: { id: noticeId },
  })

  revalidatePath('/super-admin/notices')
  revalidatePath('/', 'layout')
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

  const [battleRes, killRes] = await Promise.all([
    fetch(`${appUrl}/api/cron/battle-tracker`, { headers, cache: 'no-store' }),
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

  revalidatePath('/super-admin')
  revalidatePath('/admin/dashboard/stats')
  return result
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

  revalidatePath(`/super-admin/tenants/${tenantId}`)
}
