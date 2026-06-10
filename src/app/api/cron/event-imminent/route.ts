import { NextResponse } from 'next/server'
import { isDiscordDmConfigured } from '@/lib/discord-dm'
import {
  resolveDiscordDmLocaleMap,
  sendLocalizedDiscordDmsToUsers,
  type DiscordDmLocaleRow,
} from '@/lib/discord-dm-localized'
import { getAppSetting } from '@/lib/app-settings'
import { listActiveTenants } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { isValidTenantTimezone } from '@/lib/timezone'
import { log } from '@/lib/log'
import { withCronRun } from '@/lib/cron-run'
import type { EventCategory } from '@/types'

// 이벤트 집결 시간이 다가오면 파티에 편성된 멤버들에게 Discord DM 을 보낸다.
//
// 호출 규약: Vercel cron 이 Authorization: Bearer <CRON_SECRET> 로 GET 을 날려
// 이 라우트를 호출. 수동 트리거도 같은 헤더로 가능.
//
// 동작 (per-user lead time, migration 102 이후):
//   1. gather_at 이 [now - LOOKBACK_MIN, now + MAX_LEAD_MIN] 안의 published 이벤트
//      를 스캔.
//   2. 각 이벤트의 assigned 멤버 + 개인 dm_lead_minutes (NULL 이면 길드 기본값)
//      를 조회.
//   3. 각 멤버에 대해 (gather_at - 개인 lead) 가 [now - LOOKBACK_MIN, now] 에
//      들어오면 발송 대상.
//   4. event_dm_sent (event_id, discord_id) 에 행이 없는 경우만 실제 발송 후
//      바로 insert (중복 방지). PK 충돌은 무시.
//
// auto-start (events_auto_start_enabled) 동작은 분리. lead time 과 무관하게
// gather_at 이 지난 이벤트의 battle_started_at 을 자동 마킹.
//
// imminent_notified_at 컬럼은 더 이상 새 로직에서 사용하지 않는다 (legacy 데이터
// 호환을 위해 남겨둠). 새 dedupe 는 event_dm_sent 만으로 처리.

// 길드 기본값(app_settings.event_dm_lead_minutes) 의 폴백.
const DEFAULT_GUILD_LEAD_MIN = 35
// 1440분(24h) 이전부터 조회. 개인이 24시간 전 알림으로 설정한 경우를 커버.
const MAX_LEAD_MIN = 1440
// 놓친 구간 재캐치용 (크론 누락 대비). cron 주기가 5분이라 5분 정도면 충분.
const LOOKBACK_MIN = 5
// 자동 시작 lookback. 4/21~4/25 운영 중 한 번에 1~2시간씩 cron 이 누락되어
// 자동 시작이 실패한 사례가 다수 발생 (GitHub Actions schedule 의 공용 러너
// 지연이 원인). Vercel Pro native cron 으로 옮겨 schedule 자체는 정확해졌지만,
// 배포 직후 함수 콜드스타트나 일시적 장애로 1~2틱이 밀릴 수 있어 lookback 을
// 크게 잡아 안전망을 둔다. 너무 길게 두면 토글을 처음 켠 순간 과거 이벤트가
// 일제히 시작되는 위험이 있는데, 그 케이스는 자체적으로 `battle_started_at
// IS NULL` 조건이 걸러주므로(이미 종료된 이벤트는 보통 시작 시각이 적혀 있음)
// 실용상 6시간 정도면 안전한 트레이드오프.
const AUTO_START_LOOKBACK_MIN = 360

export const dynamic = 'force-dynamic'

// gather_at 표시는 테넌트별 운영 시간대를 따른다. 잘못된 IANA 가 박혀 있어도
// getTenantTimezone 이 'Asia/Seoul' 로 degrade 하므로 DM 본문은 절대 깨지지 않음.
function formatGatherTimeIn(gatherAtIso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(gatherAtIso))
}

// 길드 기본 lead 분 — 잘못된 값/없음은 35로 degrade.
function parseGuildDefaultLead(raw: string | null | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_LEAD_MIN) {
    return DEFAULT_GUILD_LEAD_MIN
  }
  return n
}

// 개인 override 가 NULL/유효 범위 밖이면 길드 기본값을 사용.
function effectiveLead(override: number | null | undefined, guildDefault: number): number {
  if (override === null || override === undefined) return guildDefault
  if (!Number.isFinite(override) || !Number.isInteger(override)) return guildDefault
  if (override < 1 || override > MAX_LEAD_MIN) return guildDefault
  return override
}

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'event-imminent', leaseSeconds: 300 }, async ({ db }) => {
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
      log.error('[cron/event-imminent] auto-start scan failed', pendingError, {
        tenant_id: tenant.id,
      })
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
        log.error('[cron/event-imminent] auto-start update failed', updateError, {
          tenant_id: tenant.id,
          event_id: row.id,
        })
        continue
      }
      log.info('[cron/event-imminent] auto-started event', {
        tenant_id: tenant.id,
        event_id: row.id,
        gather_at: gatherAt,
      })
      autoStartResults.push({ event_id: row.id, battle_started_at: gatherAt })
    }
  }

  if (!isDiscordDmConfigured()) {
    return NextResponse.json({ skipped: 'discord-dm-not-configured', auto_started: autoStartResults })
  }

  // 가장 큰 lead 까지 미리 스캔 — 24h 전부터 발송 대상이 될 수 있다.
  const upperBound = new Date(now.getTime() + MAX_LEAD_MIN * 60 * 1000).toISOString()
  const lowerBound = new Date(now.getTime() - LOOKBACK_MIN * 60 * 1000).toISOString()

  // 임박 이벤트는 tenant 무관하게 한 번에 스캔. 발송 단위가 (event, member) 이라
  // 길드 기본 lead 는 per-event 로 lookup 해야 하지만, 그 외 dedupe/필터는 동일.
  const { data: events, error: eventsError } = await db
    .from('events')
    .select('id, guild_id, title, gather_at, category')
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

  const results: Array<{ event_id: string; attempted: number; succeeded: number }> = []

  // 길드 기본 lead 를 같은 cron 틱 안에서 캐시 — 동일 tenant 의 여러 이벤트가
  // 같은 호출을 반복하지 않도록.
  const guildDefaultLeadCache = new Map<string, number>()

  for (const event of events) {
    const guildId = event.guild_id as string
    let guildDefault = guildDefaultLeadCache.get(guildId)
    if (guildDefault === undefined) {
      const raw = await getAppSetting(
        'event_dm_lead_minutes',
        String(DEFAULT_GUILD_LEAD_MIN),
        guildId,
      )
      guildDefault = parseGuildDefaultLead(raw)
      guildDefaultLeadCache.set(guildId, guildDefault)
    }

    // 이벤트당 편성된 멤버 모두 — 중복 제거.
    const { data: slots, error: slotsError } = await db
      .from('slots')
      .select('assigned_discord_id, parties!inner(event_id)')
      .eq('parties.event_id', event.id)
      .not('assigned_discord_id', 'is', null)
    if (slotsError) {
      log.error('[cron/event-imminent] slots query failed', slotsError, {
        tenant_id: guildId,
        event_id: event.id,
      })
      continue
    }

    const discordIds = Array.from(
      new Set(
        (slots ?? [])
          .map((s) => s.assigned_discord_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    )

    if (discordIds.length === 0) {
      results.push({ event_id: event.id, attempted: 0, succeeded: 0 })
      continue
    }

    // 각 멤버의 개인 lead override + 시간대/언어 override 조회 — guild_avatars
    // + guests 합집합. 시간대는 alarm 본문 포맷 시 per-user 로 적용된다.
    const [{ data: avatars }, { data: guests }, { data: alreadySent }] = await Promise.all([
      db
        .from('guild_avatars')
        .select('discord_id, dm_lead_minutes, timezone, preferred_language')
        .eq('guild_id', guildId)
        .in('discord_id', discordIds),
      db
        .from('guests')
        .select('discord_id, dm_lead_minutes, timezone, preferred_language')
        .eq('guild_id', guildId)
        .in('discord_id', discordIds),
      db
        .from('event_dm_sent')
        .select('discord_id')
        .eq('event_id', event.id)
        .in('discord_id', discordIds),
    ])

    const leadOverrideMap = new Map<string, number | null>()
    const tzOverrideMap = new Map<string, string | null>()
    const avatarRows = (avatars ?? []) as Array<DiscordDmLocaleRow & {
      dm_lead_minutes: number | null
      timezone: string | null
    }>
    const guestRows = (guests ?? []) as Array<DiscordDmLocaleRow & {
      discord_id: string
      dm_lead_minutes: number | null
      timezone: string | null
    }>
    const localeMap = resolveDiscordDmLocaleMap(discordIds, avatarRows, guestRows)
    for (const row of [...avatarRows, ...guestRows]) {
      // 같은 Discord ID 가 guild_avatars 와 guests 양쪽에 있으면 (이론상 드물지만
      // 게스트 → 정규 멤버 전환 잔재 등) 첫 진입을 우선. 둘 다 NULL 이면 어차피
      // 길드 기본을 따른다.
      if (!row.discord_id) continue
      if (!leadOverrideMap.has(row.discord_id)) {
        leadOverrideMap.set(row.discord_id, row.dm_lead_minutes)
        tzOverrideMap.set(row.discord_id, row.timezone)
      }
    }
    const sentSet = new Set((alreadySent ?? []).map((r) => r.discord_id as string))

    const fireWindowEnd = now.getTime()
    const fireWindowStart = now.getTime() - LOOKBACK_MIN * 60 * 1000
    const gatherAtMs = new Date(event.gather_at as string).getTime()

    // 발송 대상 = override 적용 후 (gather_at - lead) 가 fire window 안 + 미발송.
    const eligible: string[] = []
    for (const id of discordIds) {
      if (sentSet.has(id)) continue
      const lead = effectiveLead(leadOverrideMap.get(id) ?? null, guildDefault)
      const fireAt = gatherAtMs - lead * 60 * 1000
      if (fireAt >= fireWindowStart && fireAt <= fireWindowEnd) {
        eligible.push(id)
      }
    }

    let attempted = 0
    let succeeded = 0

    if (eligible.length > 0) {
      const tenantTz = await getTenantTimezone(guildId)
      // 동일 timezone 사용자끼리 묶어 한 번에 발송 — Discord API 호출 자체는
      // 사용자별 1회씩이지만, 본문 포맷팅을 timezone 그룹별로 한 번만 하기 위함.
      const groups = new Map<string, string[]>()
      for (const id of eligible) {
        const override = tzOverrideMap.get(id) ?? null
        // 잘못된 IANA 가 박혀 있어도 (예: 마이그 이전 잔재) 안전하게 길드 기본으로
        // 폴백 — formatGatherTimeIn 자체는 Intl 이 던지면 죽으므로 사전 검증.
        const userTz =
          override !== null && isValidTenantTimezone(override) ? override : tenantTz
        const bucket = groups.get(userTz) ?? []
        bucket.push(id)
        groups.set(userTz, bucket)
      }

      // event.category 는 migration 063+064 이후 NOT NULL. 개인 옵트아웃
      // (notify_combat / notify_ff / notify_ganking) 과 AND.
      const category = (event.category ?? '전투') as EventCategory

      for (const [tz, ids] of groups) {
        const time = formatGatherTimeIn(event.gather_at as string, tz)
        const result = await sendLocalizedDiscordDmsToUsers(
          ids,
          guildId,
          (t) => ({
            title: t('eventImminentTitle', { title: event.title }),
            body: t('eventImminentBody', { time }),
            url: `/events/${event.id}`,
          }),
          category,
          localeMap,
        )
        attempted += result.attempted
        succeeded += result.succeeded
      }

      // sendLocalizedDiscordDmsToUsers 가 옵트아웃을 한 번 더 거른다 — 실제 attempted 만
      // event_dm_sent 에 마킹해서, 옵트인 후에는 다시 발송할 수 있도록 한다.
      // (옵트아웃 상태라면 사실상 영원히 못 받는 거라 마킹할 필요도 없음)
      // 하지만 그렇게 하면 옵트아웃 → 옵트인 전환 사이에 누가 받지 못한 채로
      // 시간이 흐를 수 있어, 차라리 모든 eligible 을 마킹해 한 번만 시도되도록
      // 하는 편이 단순. 아래는 후자 정책 — 모든 eligible 을 마킹.
      const rows = eligible.map((discord_id) => ({
        event_id: event.id,
        guild_id: guildId,
        discord_id,
      }))
      const { error: insertError } = await db
        .from('event_dm_sent')
        .upsert(rows, { onConflict: 'event_id,discord_id', ignoreDuplicates: true })
      if (insertError) {
        log.error('[cron/event-imminent] event_dm_sent upsert failed', insertError, {
          tenant_id: guildId,
          event_id: event.id,
        })
      }
    }

    results.push({
      event_id: event.id,
      attempted,
      succeeded,
    })
  }

  return NextResponse.json({ scanned: events.length, results, auto_started: autoStartResults })
  })
}
