import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { isDiscordDmConfigured, sendDiscordDmsToUsers } from '@/lib/discord-dm'
import { getAppSetting } from '@/lib/app-settings'

// 이벤트 집결 시간이 다가오면 파티에 편성된 멤버들에게 Discord DM 을 보낸다.
//
// 호출 규약: 스케줄러가 Authorization: Bearer <CRON_SECRET> 로 GET 을 날려
// 이 라우트를 호출. 수동 트리거도 같은 헤더로 가능.
//
// 동작:
//   1. gather_at 이 이후 LEAD_MIN 분 이내이고 아직 imminent_notified_at 이
//      NULL 인 이벤트를 찾음.
//   2. 해당 이벤트의 slots.assigned_discord_id 를 수집해 중복 제거.
//   3. discord_dm_enabled = true 인 수신자에게 DM 발송.
//   4. events.imminent_notified_at 를 현재 시각으로 표시해 중복 발송 방지.
//
// 스케줄링: Vercel Hobby 플랜은 일 1회 제한이라 cron 을 걸 수 없어,
// .github/workflows/event-imminent.yml 의 GitHub Actions 가 5분 주기로 이 엔드포인트를
// 호출한다. Pro 로 업그레이드하면 vercel.json 에 다시 옮길 수 있음.
//
// locale: 이전 Web Push 때는 구독별 locale 을 저장했지만 DM 으로 바뀌면서
// 개인 locale 을 따로 저장하지 않는다. 길드가 KST 한국어 기준이라 기본 'ko'
// 로 발송. 향후 필요하면 guild_avatars.locale 을 추가해 개인화할 수 있음.

const LEAD_MIN = 35 // gather_at - 35분 이내면 임박
const LOOKBACK_MIN = 5 // 놓친 구간 재캐치용 (크론 누락 대비)
// 자동 시작은 gather_at 이 지난 이벤트를 최근 구간에서만 스캔. 너무 길게 두면
// 설정을 처음 켠 순간 과거 이벤트가 한꺼번에 시작 처리될 수 있다.
const AUTO_START_LOOKBACK_MIN = 30
const DISPLAY_TIMEZONE = 'Asia/Seoul' // 길드가 KST 기준으로 운영
const DEFAULT_LOCALE = 'ko'

export const dynamic = 'force-dynamic'

function formatGatherTime(gatherAtIso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(gatherAtIso))
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

  const db = getAdminClient()
  const now = new Date()

  // Auto-start: scheduled events whose gather_at is in the recent past get
  // their battle_started_at set automatically, opening the regear window at
  // the planned time. Runs regardless of DM configuration — it's a DB-only
  // side effect. Idempotent (update is conditional on battle_started_at IS NULL).
  const autoStartEnabled = (await getAppSetting('events_auto_start_enabled', 'false')) === 'true'
  const autoStartResults: Array<{ event_id: string; battle_started_at: string }> = []
  if (autoStartEnabled) {
    const autoStartFloor = new Date(now.getTime() - AUTO_START_LOOKBACK_MIN * 60 * 1000).toISOString()
    const { data: pending, error: pendingError } = await db
      .from('events')
      .select('id, gather_at')
      .is('battle_started_at', null)
      .not('gather_at', 'is', null)
      .gte('gather_at', autoStartFloor)
      .lte('gather_at', now.toISOString())
    if (pendingError) {
      console.error('[cron/event-imminent] auto-start scan failed:', pendingError.message)
    } else {
      for (const row of pending ?? []) {
        const gatherAt = row.gather_at as string
        const { error: updateError } = await db
          .from('events')
          .update({ battle_started_at: gatherAt })
          .eq('id', row.id)
          .is('battle_started_at', null)
        if (updateError) {
          console.error('[cron/event-imminent] auto-start update failed:', updateError.message)
          continue
        }
        autoStartResults.push({ event_id: row.id, battle_started_at: gatherAt })
      }
    }
  }

  if (!isDiscordDmConfigured()) {
    return NextResponse.json({ skipped: 'discord-dm-not-configured', auto_started: autoStartResults })
  }

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
    return NextResponse.json({ notified: 0, scanned: 0, auto_started: autoStartResults })
  }

  const t = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'discordDm' })
  const results: Array<{ event_id: string; attempted: number; succeeded: number }> = []

  for (const event of events) {
    // 이벤트당 편성된 멤버 모두 — 중복 제거 후 DM 발송.
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
      const time = formatGatherTime(event.gather_at as string)
      const result = await sendDiscordDmsToUsers(discordIds, {
        title: t('eventImminentTitle', { title: event.title }),
        body: t('eventImminentBody', { time }),
        url: `/events/${event.id}`,
      })
      attempted = result.attempted
      succeeded = result.succeeded
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

  return NextResponse.json({ scanned: events.length, results, auto_started: autoStartResults })
}
