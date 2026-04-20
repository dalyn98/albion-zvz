import 'server-only'
import webpush from 'web-push'
import { getAdminClient } from './supabase-admin'

// Web Push 발송용 공용 모듈. VAPID 키는 env 에만 두고, 호출부는 sendPushToUser
// 같은 고수준 헬퍼만 사용한다. 410/404 응답은 구독이 무효화된 신호이므로
// 해당 행을 DB 에서 자동 삭제한다.

export interface PushPayload {
  title: string
  body: string
  // 알림 클릭 시 열리는 경로 (상대 경로). Service Worker 가 origin 앞에 붙여서 이동.
  url?: string
  // 같은 tag 의 알림이 이미 떠 있으면 교체된다 — 중복 방지용.
  tag?: string
}

interface VapidConfig {
  publicKey: string
  privateKey: string
  subject: string
}

function loadVapid(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return null
  return { publicKey, privateKey, subject }
}

let vapidConfigured = false
function ensureVapid(): VapidConfig | null {
  const config = loadVapid()
  if (!config) return null
  if (!vapidConfigured) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
    vapidConfigured = true
  }
  return config
}

export function isPushConfigured(): boolean {
  return loadVapid() !== null
}

export function getPublicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null
}

export interface SubscriptionRow {
  id: string
  discord_id: string
  endpoint: string
  p256dh: string
  auth: string
  locale: string
  failure_count: number
}

async function fetchSubscriptions(discordIds: string[]): Promise<SubscriptionRow[]> {
  if (discordIds.length === 0) return []
  const db = getAdminClient()
  const { data, error } = await db
    .from('push_subscriptions')
    .select('id, discord_id, endpoint, p256dh, auth, locale, failure_count')
    .in('discord_id', discordIds)
  if (error) {
    console.error('[web-push] fetchSubscriptions failed:', error.message)
    return []
  }
  return (data ?? []) as SubscriptionRow[]
}

// 구독 집합을 직접 받아 locale 별로 다른 payload 를 보낼 수 있는 저수준 API.
// 크론처럼 요청 주체의 locale 이 없는 곳에서 각 구독자의 locale 에 맞춰
// 문구를 보내고 싶을 때 사용한다.
export async function fetchSubscriptionsForUsers(
  discordIds: string[],
): Promise<SubscriptionRow[]> {
  return fetchSubscriptions(discordIds)
}

// 실패 카운트가 임계치를 넘으면 정리. 네트워크 장애 한두 번에 구독을 지우지
// 않도록 5회 이상 연속 실패한 경우에만 삭제한다.
const MAX_FAILURES_BEFORE_DELETE = 5

async function markSubscriptionFailure(id: string, nextCount: number): Promise<void> {
  const db = getAdminClient()
  if (nextCount >= MAX_FAILURES_BEFORE_DELETE) {
    await db.from('push_subscriptions').delete().eq('id', id)
    return
  }
  await db
    .from('push_subscriptions')
    .update({
      failure_count: nextCount,
      last_failure_at: new Date().toISOString(),
    })
    .eq('id', id)
}

async function markSubscriptionSuccess(id: string): Promise<void> {
  const db = getAdminClient()
  await db
    .from('push_subscriptions')
    .update({
      failure_count: 0,
      last_success_at: new Date().toISOString(),
    })
    .eq('id', id)
}

async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const db = getAdminClient()
  await db.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

interface SendResult {
  attempted: number
  succeeded: number
  removed: number
}

async function sendOne(
  row: SubscriptionRow,
  payload: PushPayload,
): Promise<'ok' | 'gone' | 'retry'> {
  try {
    await webpush.sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 },
    )
    return 'ok'
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) return 'gone'
    console.error('[web-push] send failed:', e)
    return 'retry'
  }
}

// 이미 조회된 구독 행들에 payload 를 발송한다. 크론처럼 한 번 fetch 해둔 집합을
// locale 별로 쪼개 각기 다른 문구로 보낼 때 쓴다.
export async function sendPushToSubscriptions(
  rows: SubscriptionRow[],
  payload: PushPayload,
): Promise<SendResult> {
  const config = ensureVapid()
  if (!config) {
    console.warn('[web-push] VAPID keys not configured — skipping send.')
    return { attempted: 0, succeeded: 0, removed: 0 }
  }
  if (rows.length === 0) return { attempted: 0, succeeded: 0, removed: 0 }

  let succeeded = 0
  let removed = 0
  // 순차 처리 — 한 유저가 여러 기기를 가지는 경우가 대부분이라 병렬화 이득이
  // 작고, DB 업데이트 충돌을 피하는 쪽이 단순하다.
  for (const sub of rows) {
    const result = await sendOne(sub, payload)
    if (result === 'ok') {
      succeeded++
      await markSubscriptionSuccess(sub.id)
    } else if (result === 'gone') {
      removed++
      await deleteSubscriptionByEndpoint(sub.endpoint)
    } else {
      await markSubscriptionFailure(sub.id, sub.failure_count + 1)
    }
  }
  return { attempted: rows.length, succeeded, removed }
}

export async function sendPushToUsers(
  discordIds: string[],
  payload: PushPayload,
): Promise<SendResult> {
  const subs = await fetchSubscriptions(discordIds)
  return sendPushToSubscriptions(subs, payload)
}

export async function sendPushToUser(
  discordId: string,
  payload: PushPayload,
): Promise<SendResult> {
  return sendPushToUsers([discordId], payload)
}
