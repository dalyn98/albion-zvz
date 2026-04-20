'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getLocale } from '@/lib/locale'
import { getPublicVapidKey, isPushConfigured, sendPushToUser } from '@/lib/web-push'

// 클라이언트가 PushManager.subscribe 결과(JSON)를 그대로 넘기면 그중 필요한
// 부분만 뽑아 저장한다. endpoint 가 UNIQUE 이므로 upsert 로 동일 기기의 재등록을
// 흡수한다.
interface SubscribePayload {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  userAgent?: string
}

function validateSubscribePayload(raw: unknown): SubscribePayload | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const endpoint = typeof obj.endpoint === 'string' ? obj.endpoint : null
  const keys = obj.keys as Record<string, unknown> | undefined
  const p256dh = keys && typeof keys.p256dh === 'string' ? keys.p256dh : null
  const auth = keys && typeof keys.auth === 'string' ? keys.auth : null
  if (!endpoint || !p256dh || !auth) return null
  const userAgent = typeof obj.userAgent === 'string' ? obj.userAgent : undefined
  return { endpoint, keys: { p256dh, auth }, userAgent }
}

export async function registerPushSubscription(
  rawPayload: unknown,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!isPushConfigured()) return { error: tErr('pushUnavailable') }

  const payload = validateSubscribePayload(rawPayload)
  if (!payload) return { error: tErr('invalidPushSubscription') }

  const locale = await getLocale()
  const db = getAdminClient()
  // onConflict: endpoint — 같은 브라우저가 다시 구독해도 row 는 하나만 유지.
  // discord_id 는 기기 주인이 바뀔 수 있으므로 (로그아웃 후 다른 계정 로그인)
  // 업데이트 대상에 포함.
  const { error } = await db
    .from('push_subscriptions')
    .upsert(
      {
        discord_id: session.discordId,
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        user_agent: payload.userAgent ?? null,
        locale,
        failure_count: 0,
        last_failure_at: null,
      },
      { onConflict: 'endpoint' },
    )
  if (error) return { error: error.message }
  revalidatePath('/me/profile')
  return {}
}

export async function unregisterPushSubscription(
  endpoint: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }

  if (!endpoint || typeof endpoint !== 'string') {
    return { error: tErr('invalidPushSubscription') }
  }

  const db = getAdminClient()
  // 주인 일치 검증 — 엔드포인트를 타인이 보내 해지하는 걸 막는다.
  const { data: existing, error: selectError } = await db
    .from('push_subscriptions')
    .select('discord_id')
    .eq('endpoint', endpoint)
    .maybeSingle()
  if (selectError) return { error: selectError.message }
  if (!existing) return {}
  if (existing.discord_id !== session.discordId) return {}

  const { error } = await db.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) return { error: error.message }
  revalidatePath('/me/profile')
  return {}
}

// UI 토글 상태 확인용. 클라이언트의 PushManager 구독과 서버 DB 가 일치하지 않는
// 경우 (예: 기기 초기화, 브라우저 교체) UI 에서 다시 동기화할 수 있다.
export async function hasPushSubscription(endpoint: string): Promise<boolean> {
  const session = await getSession()
  if (!session) return false
  const db = getAdminClient()
  const { data } = await db
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', endpoint)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  return !!data
}

export async function getPublicPushKey(): Promise<string | null> {
  return getPublicVapidKey()
}

// "내 구독이 살아 있나" 확인 겸, 기능 동작을 검증하는 테스트 발송.
export async function sendTestPush(): Promise<{ error?: string; sent?: number }> {
  const tErr = await getTranslations('memberActionError')
  const tPush = await getTranslations('pushNotifications')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!isPushConfigured()) return { error: tErr('pushUnavailable') }

  const result = await sendPushToUser(session.discordId, {
    title: tPush('testTitle'),
    body: tPush('testBody'),
    url: '/me/profile',
    tag: 'menhera-test',
  })
  return { sent: result.succeeded }
}
