import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  fetchSubscriptionsForUsers,
  isPushConfigured,
  sendPushToSubscriptions,
  type SubscriptionRow,
} from '@/lib/web-push'

// 이벤트 집결 시간이 다가오면 파티에 편성된 멤버들에게 푸시를 보낸다.
//
// 호출 규약: Vercel Cron 이 Authorization: Bearer <CRON_SECRET> 로 GET 을 날려
// 이 라우트를 호출. 수동 트리거도 같은 헤더로 가능.
//
// 동작:
//   1. gather_at 이 이후 LEAD_MIN 분 이내이고 아직 imminent_notified_at 이
//      NULL 인 이벤트를 찾음.
//   2. 해당 이벤트의 slots.assigned_discord_id 를 수집해 구독 행을 fetch.
//   3. locale 별로 구독을 그룹화해 각 언어에 맞는 문구로 발송.
//   4. events.imminent_notified_at 를 현재 시각으로 표시해 중복 발송 방지.
//
// 크론 주기는 vercel.json 에서 관리.

const LEAD_MIN = 35 // gather_at - 35분 이내면 임박
const LOOKBACK_MIN = 5 // 놓친 구간 재캐치용 (크론 누락 대비)
const DISPLAY_TIMEZONE = 'Asia/Seoul' // 길드가 KST 기준으로 운영 — 모든 locale 공통

export const dynamic = 'force-dynamic'

function formatGatherTime(gatherAtIso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(gatherAtIso))
}

function groupByLocale(rows: SubscriptionRow[]): Map<string, SubscriptionRow[]> {
  const map = new Map<string, SubscriptionRow[]>()
  for (const row of rows) {
    const list = map.get(row.locale) ?? []
    list.push(row)
    map.set(row.locale, list)
  }
  return map
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ skipped: 'vapid-not-configured' })
  }

  const db = getAdminClient()
  const now = new Date()
  const upperBound = new Date(now.getTime() + LEAD_MIN * 60 * 1000).toISOString()
  const lowerBound = new Date(now.getTime() - LOOKBACK_MIN * 60 * 1000).toISOString()

  const { data: events, error: eventsError } = await db
    .from('events')
    .select('id, title, gather_at')
    .is('imminent_notified_at', null)
    .not('gather_at', 'is', null)
    .gte('gather_at', lowerBound)
    .lte('gather_at', upperBound)
  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 })
  }

  if (!events || events.length === 0) {
    return NextResponse.json({ notified: 0, scanned: 0 })
  }

  const results: Array<{ event_id: string; attempted: number; succeeded: number }> = []

  for (const event of events) {
    // 이벤트당 편성된 멤버 모두 — 중복 제거 후 구독 fetch.
    const { data: slots, error: slotsError } = await db
      .from('slots')
      .select('assigned_discord_id, parties!inner(event_id)')
      .eq('parties.event_id', event.id)
      .not('assigned_discord_id', 'is', null)
    if (slotsError) {
      console.error('[cron/event-imminent] slots query failed:', slotsError.message)
      continue
    }

    const discordIds = Array.from(
      new Set(
        (slots ?? [])
          .map((s) => s.assigned_discord_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    )

    let attempted = 0
    let succeeded = 0

    if (discordIds.length > 0) {
      const subs = await fetchSubscriptionsForUsers(discordIds)
      const byLocale = groupByLocale(subs)
      const time = formatGatherTime(event.gather_at as string)

      for (const [locale, rows] of byLocale) {
        const t = await getTranslations({ locale, namespace: 'pushNotifications' })
        const payload = {
          title: t('eventImminentTitle', { title: event.title }),
          body: t('eventImminentBody', { time }),
          url: `/events/${event.id}`,
          tag: `event-imminent-${event.id}`,
        }
        const result = await sendPushToSubscriptions(rows, payload)
        attempted += result.attempted
        succeeded += result.succeeded
      }
    }

    // 멤버가 없어도 notified 로 표시 — 다음 크론에서 같은 이벤트를 다시 스캔하지
    // 않도록 한다.
    const { error: markError } = await db
      .from('events')
      .update({ imminent_notified_at: now.toISOString() })
      .eq('id', event.id)
      .is('imminent_notified_at', null)
    if (markError) {
      console.error('[cron/event-imminent] mark failed:', markError.message)
    }

    results.push({
      event_id: event.id,
      attempted,
      succeeded,
    })
  }

  return NextResponse.json({ scanned: events.length, results })
}
