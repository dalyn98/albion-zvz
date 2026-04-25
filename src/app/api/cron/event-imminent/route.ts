import { NextResponse } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { isDiscordDmConfigured, sendDiscordDmsToUsers } from '@/lib/discord-dm'
import { getAppSetting } from '@/lib/app-settings'
import { listActiveTenants } from '@/lib/tenant'
import type { EventCategory } from '@/types'

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
// 자동 시작 lookback. 4/21~4/25 운영 중 한 번에 1~2시간씩 cron 이 누락되어
// 자동 시작이 실패한 사례가 다수 발생 (GitHub Actions schedule 의 공용 러너
// 지연이 원인). Vercel Pro native cron 으로 옮겨 schedule 자체는 정확해졌지만,
// 배포 직후 함수 콜드스타트나 일시적 장애로 1~2틱이 밀릴 수 있어 lookback 을
// 크게 잡아 안전망을 둔다. 너무 길게 두면 토글을 처음 켠 순간 과거 이벤트가
// 일제히 시작되는 위험이 있는데, 그 케이스는 자체적으로 `battle_started_at
// IS NULL` 조건이 걸러주므로(이미 종료된 이벤트는 보통 시작 시각이 적혀 있음)
// 실용상 6시간 정도면 안전한 트레이드오프.
const AUTO_START_LOOKBACK_MIN = 360
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
  const tenants = await listActiveTenants()

  // Auto-start: 테넌트별 events_auto_start_enabled 설정을 존중. 끄지 않은 테넌트의
  // 지난 gather_at 이벤트만 자동 시작.
  const autoStartResults: Array<{ event_id: string; battle_started_at: string }> = []
  const autoStartFloor = new Date(now.getTime() - AUTO_START_LOOKBACK_MIN * 60 * 1000).toISOString()
  for (const tenant of tenants) {
    const enabled = (await getAppSetting('events_auto_start_enabled', 'false', tenant.id)) === 'true'
    if (!enabled) continue
    const { data: pending, error: pendingError } = await db
      .from('events')
      .select('id, gather_at')
      .eq('guild_id', tenant.id)
      .is('battle_started_at', null)
      .not('gather_at', 'is', null)
      // draft 이벤트는 auto-start 대상에서 제외 — 아직 발행 전이라 전투 시작 X.
      .eq('status', 'published')
      .gte('gather_at', autoStartFloor)
      .lte('gather_at', now.toISOString())
    if (pendingError) {
      console.error('[cron/event-imminent] auto-start scan failed:', pendingError.message)
      continue
    }
    for (const row of pending ?? []) {
      const gatherAt = row.gather_at as string
      const { error: updateError } = await db
        .from('events')
        .update({ battle_started_at: gatherAt })
        .eq('guild_id', tenant.id)
        .eq('id', row.id)
        .is('battle_started_at', null)
      if (updateError) {
        console.error('[cron/event-imminent] auto-start update failed:', updateError.message)
        continue
      }
      console.log(`[cron/event-imminent] auto-started event ${row.id} (gather_at=${gatherAt}) for tenant ${tenant.id}`)
      autoStartResults.push({ event_id: row.id, battle_started_at: gatherAt })
    }
  }

  if (!isDiscordDmConfigured()) {
    return NextResponse.json({ skipped: 'discord-dm-not-configured', auto_started: autoStartResults })
  }

  const upperBound = new Date(now.getTime() + LEAD_MIN * 60 * 1000).toISOString()
  const lowerBound = new Date(now.getTime() - LOOKBACK_MIN * 60 * 1000).toISOString()

  // 임박 이벤트는 tenant 무관하게 한 번에 스캔한다 — DM 은 개인 단위라 tenant 격리가
  // 부가 가치가 없고, imminent_notified_at 은 이벤트당 1회라 이미 중복이 없다.
  const { data: events, error: eventsError } = await db
    .from('events')
    .select('id, guild_id, title, gather_at, category')
    .is('imminent_notified_at', null)
    .not('gather_at', 'is', null)
    // draft 이벤트는 임박 DM 대상 아님 — 발행된 이벤트만 DM.
    .eq('status', 'published')
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
      // event.category 는 migration 063+064 이후 NOT NULL. 개인 옵트아웃
      // (notify_combat / notify_ff / notify_ganking) 과 AND.
      const category = (event.category ?? '전투') as EventCategory
      const result = await sendDiscordDmsToUsers(
        discordIds,
        event.guild_id as string,
        {
          title: t('eventImminentTitle', { title: event.title }),
          body: t('eventImminentBody', { time }),
          url: `/events/${event.id}`,
        },
        category,
      )
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
