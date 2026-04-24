'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { getAppSetting } from '@/lib/app-settings'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTranslations } from 'next-intl/server'
import type { AlbionServer } from '@/lib/albion-gameinfo'

export interface TopHolder {
  discordId: string
  username: string
  avatar: string | null
  isAdmin: boolean
  balance: number
}

export interface PointStats {
  // 길드원 모두의 현재 보유 포인트 합 — 곧 지급해야 할 '부채' 규모.
  // 탈퇴자 포함 — 실제 원장 부채는 탈퇴 여부와 무관하게 존재.
  totalHeld: number
  // 지금까지 지급된 포인트(리기어 승인 + 기부 승인 + admin_adjust 양수 등) 누적.
  lifetimeEarned: number
  // 지금까지 소비된 포인트(환전/상점/admin_adjust 음수 등) 누적 절대값.
  lifetimeSpent: number
  // 포인트 원장에 기록된 총 건수. 길드 활동량 지표.
  entriesCount: number
  memberCount: number
  topHolders: TopHolder[]
  // 탈퇴한 사용자(guild_avatars.withdrawn_at IS NOT NULL) 의 잔액 합계 — 즉시
  // 회수/정리 대상이 될 수 있는 '잠긴' 부채 규모.
  withdrawnHeld: number
  // 탈퇴한 사용자들의 개별 잔액 목록. 0 보다 큰 잔액만 노출(통계 의미).
  withdrawnHolders: TopHolder[]
}

// 이벤트 참여 집계 창: 과거 30일. 직관적 '최근 한 달' 지표로 운영진에게 친숙.
const PARTICIPATION_WINDOW_DAYS = 30
// 상점/리기어 트렌드 창: 과거 7일. 주문·리기어 쪽은 단기 신호가 중요.
const SHOP_REGEAR_WINDOW_DAYS = 7

export interface TopAttendee {
  discordId: string
  username: string
  avatar: string | null
  isAdmin: boolean
  // 최근 30일 동안 슬롯을 차지한 서로 다른 event 수.
  eventCount: number
}

export interface EventStats {
  windowDays: number
  // 창 내 생성된 이벤트 수.
  totalEvents: number
  // 창 내 최소 1회라도 슬롯을 차지한 고유 길드원 수.
  activeMembers: number
  // 전체 등록 길드원(guild_avatars) 수 — 참여율 분모.
  totalMembers: number
  // activeMembers / totalMembers (0~1). totalMembers==0 이면 0.
  participationRate: number
  topAttendees: TopAttendee[]
}

export interface TopSoldItem {
  uniqueName: string
  enchant: number
  quality: number
  nameKo: string
  // 창 내 승인된 주문 라인의 수량 합.
  quantity: number
  // 창 내 승인된 주문 라인의 포인트 합(수익).
  points: number
}

export interface ShopRegearStats {
  windowDays: number
  // 창 내 생성된 주문 수 / 그 중 승인된 수.
  ordersCreated: number
  ordersApproved: number
  // 승인된 주문의 포인트 총합(매출).
  pointsSpent: number
  // 현재 대기중인 주문 수(전체 기간, 큐 크기).
  ordersPending: number
  // 창 내 생성된 리기어 / 그 중 승인.
  regearCreated: number
  regearApproved: number
  // 창 내 지급된 실버 총합.
  silverPaid: number
  // 현재 대기중인 리기어 수.
  regearPending: number
  topSoldItems: TopSoldItem[]
}

export async function getPointStats(): Promise<{ stats?: PointStats; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const [ledgerRes, avatarsRes] = await Promise.all([
      db.from('point_ledger').select('discord_id, delta').eq('guild_id', guildId),
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, is_admin, withdrawn_at')
        .eq('guild_id', guildId),
    ])
    if (ledgerRes.error) return { error: ledgerRes.error.message }
    if (avatarsRes.error) return { error: avatarsRes.error.message }

    const rows = ledgerRes.data ?? []
    const avatars = avatarsRes.data ?? []

    // discord_id → { balance, earned, spent } 집계.
    const balances = new Map<string, { balance: number; earned: number; spent: number }>()
    let lifetimeEarned = 0
    let lifetimeSpent = 0
    for (const row of rows) {
      const delta = Number(row.delta ?? 0)
      if (!Number.isFinite(delta)) continue
      const cur = balances.get(row.discord_id) ?? { balance: 0, earned: 0, spent: 0 }
      cur.balance += delta
      if (delta > 0) {
        cur.earned += delta
        lifetimeEarned += delta
      } else if (delta < 0) {
        cur.spent += -delta
        lifetimeSpent += -delta
      }
      balances.set(row.discord_id, cur)
    }

    // 이름/아바타 매칭 — 원장에만 있고 guild_avatars 에 없는 유저(탈퇴한 멤버)
    // 는 "이름 미상" 으로 떨어뜨리지만 합계에는 여전히 포함시킨다. 포인트
    // 부채는 discord_id 기준이지 avatar 동기화 상태에 의존하지 않기 때문.
    const avatarsByDiscord = new Map(avatars.map((a) => [a.discord_id, a]))

    const topHolders: TopHolder[] = []
    const withdrawnHolders: TopHolder[] = []
    let totalHeld = 0
    let withdrawnHeld = 0
    for (const [discordId, v] of balances.entries()) {
      totalHeld += v.balance
      // 보유 포인트가 0 이하인 사람은 "top" 에서 제외 — 0 이면 표시 가치 없고,
      // 음수면 이상 상태(관리자 조정 중) 이므로 별도 섹션이 필요하면 추후에.
      if (v.balance <= 0) continue
      const a = avatarsByDiscord.get(discordId)
      const entry: TopHolder = {
        discordId,
        username: a?.username ?? '이름 미상',
        avatar: a?.avatar ?? null,
        isAdmin: a?.is_admin ?? false,
        balance: v.balance,
      }
      // 탈퇴자는 별도 섹션으로. guild_avatars 에 없는 경우(= 레거시, avatar 미등록)
      // 는 "정상" 으로 간주 — 이 케이스는 게스트/과거 로그인 없이 ledger 만 쌓인
      // 엣지케이스라 탈퇴 분류에 포함시키면 오히려 혼동된다.
      if (a?.withdrawn_at) {
        withdrawnHolders.push(entry)
        withdrawnHeld += v.balance
      } else {
        topHolders.push(entry)
      }
    }
    topHolders.sort((a, b) => b.balance - a.balance)
    withdrawnHolders.sort((a, b) => b.balance - a.balance)

    return {
      stats: {
        totalHeld,
        lifetimeEarned,
        lifetimeSpent,
        entriesCount: rows.length,
        memberCount: balances.size,
        topHolders: topHolders.slice(0, 50),
        withdrawnHeld,
        withdrawnHolders,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function getEventStats(): Promise<{ stats?: EventStats; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const since = daysAgoIso(PARTICIPATION_WINDOW_DAYS)

    // 창 내 생성된 이벤트 id 목록을 먼저 구하고, 해당 이벤트에 속한 party id
    // 들을 한 번에 조회. slots 는 event 를 직접 참조하지 않으므로 이 단계가 필요.
    const eventsRes = await db
      .from('events')
      .select('id')
      .eq('guild_id', guildId)
      .gte('created_at', since)
    if (eventsRes.error) return { error: eventsRes.error.message }
    const eventIds = (eventsRes.data ?? []).map((e) => e.id as string)

    // 참여자 집계: events → parties → slots 조인. 슬롯이 차있는 (assigned_discord_id
    // 가 null 이 아닌) 행만 쓴다. event_id 는 parties 를 경유해야 해서 중첩 select.
    let slotRows: Array<{ discordId: string; eventId: string }> = []
    if (eventIds.length > 0) {
      const partiesRes = await db
        .from('parties')
        .select('id, event_id')
        .eq('guild_id', guildId)
        .in('event_id', eventIds)
      if (partiesRes.error) return { error: partiesRes.error.message }
      const partyToEvent = new Map<string, string>()
      for (const p of partiesRes.data ?? []) {
        partyToEvent.set(p.id as string, p.event_id as string)
      }
      const partyIds = Array.from(partyToEvent.keys())
      if (partyIds.length > 0) {
        const slotsRes = await db
          .from('slots')
          .select('assigned_discord_id, party_id')
          .eq('guild_id', guildId)
          .in('party_id', partyIds)
          .not('assigned_discord_id', 'is', null)
        if (slotsRes.error) return { error: slotsRes.error.message }
        slotRows = (slotsRes.data ?? [])
          .map((s) => {
            const discordId = s.assigned_discord_id as string | null
            const eventId = partyToEvent.get(s.party_id as string)
            if (!discordId || !eventId) return null
            return { discordId, eventId }
          })
          .filter((r): r is { discordId: string; eventId: string } => r !== null)
      }
    }

    // discord_id → Set<event_id> 로 집계(같은 이벤트에 여러 슬롯 차지해도 1회).
    const perMember = new Map<string, Set<string>>()
    for (const row of slotRows) {
      let set = perMember.get(row.discordId)
      if (!set) {
        set = new Set()
        perMember.set(row.discordId, set)
      }
      set.add(row.eventId)
    }

    // 이름/아바타 매핑. 길드원 수(= 분모)는 활동 회원(withdrawn_at IS NULL) 기준.
    // 탈퇴자가 계속 분모에 포함되면 "참여율" 이 장기적으로 과소 집계된다 —
    // 탈퇴자는 이벤트에 참여할 수 없기 때문.
    const avatarsRes = await db
      .from('guild_avatars')
      .select('discord_id, username, avatar, is_admin, withdrawn_at')
      .eq('guild_id', guildId)
    if (avatarsRes.error) return { error: avatarsRes.error.message }
    const avatarsByDiscord = new Map((avatarsRes.data ?? []).map((a) => [a.discord_id, a]))

    const topAttendees: TopAttendee[] = []
    for (const [discordId, events] of perMember.entries()) {
      const a = avatarsByDiscord.get(discordId)
      // 탈퇴자는 상위 참석자 목록에서 제외. 과거에 많이 참석했더라도 현재 길드
      // 운영 지표로서 가치가 없음.
      if (a?.withdrawn_at) continue
      topAttendees.push({
        discordId,
        username: a?.username ?? '이름 미상',
        avatar: a?.avatar ?? null,
        isAdmin: a?.is_admin ?? false,
        eventCount: events.size,
      })
    }
    topAttendees.sort((a, b) => b.eventCount - a.eventCount)

    const activeAvatars = (avatarsRes.data ?? []).filter((a) => a.withdrawn_at === null)
    const totalMembers = activeAvatars.length
    const activeSet = new Set(activeAvatars.map((a) => a.discord_id))
    let activeMembers = 0
    for (const discordId of perMember.keys()) {
      if (activeSet.has(discordId)) activeMembers++
    }
    const participationRate = totalMembers > 0 ? activeMembers / totalMembers : 0

    return {
      stats: {
        windowDays: PARTICIPATION_WINDOW_DAYS,
        totalEvents: eventIds.length,
        activeMembers,
        totalMembers,
        participationRate,
        topAttendees: topAttendees.slice(0, 20),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function getShopRegearStats(): Promise<{
  stats?: ShopRegearStats
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const since = daysAgoIso(SHOP_REGEAR_WINDOW_DAYS)

    const [
      ordersRes,
      pendingOrdersRes,
      regearRes,
      pendingRegearRes,
      approvedItemsRes,
    ] = await Promise.all([
      // 창 내 생성된 주문 — 상태/포인트로 승인 건수·매출 집계.
      db
        .from('shop_orders')
        .select('id, status, total_points')
        .eq('guild_id', guildId)
        .gte('created_at', since),
      // 큐 크기: 전체 기간 pending.
      db
        .from('shop_orders')
        .select('id', { count: 'exact', head: true })
        .eq('guild_id', guildId)
        .eq('status', 'pending'),
      // 창 내 생성된 리기어 — 집계 방식은 주문과 유사.
      db
        .from('regear_requests')
        .select('id, status, payout_silver, claimed_silver, silver')
        .eq('guild_id', guildId)
        .gte('created_at', since),
      db
        .from('regear_requests')
        .select('id', { count: 'exact', head: true })
        .eq('guild_id', guildId)
        .eq('status', 'pending'),
      // 최다 판매 아이템 — 승인된 주문에 딸린 라인만 보면 충분.
      // resolved_at 대신 created_at 기준 창을 유지해 '신청량' 과 '판매량' 의 축을 맞춘다.
      db
        .from('shop_order_items')
        .select(
          'unique_name, enchant, quality, name_ko, quantity, subtotal_points, shop_orders!inner(status, created_at)',
        )
        .eq('guild_id', guildId)
        .eq('shop_orders.status', 'approved')
        .gte('shop_orders.created_at', since),
    ])

    if (ordersRes.error) return { error: ordersRes.error.message }
    if (pendingOrdersRes.error) return { error: pendingOrdersRes.error.message }
    if (regearRes.error) return { error: regearRes.error.message }
    if (pendingRegearRes.error) return { error: pendingRegearRes.error.message }
    if (approvedItemsRes.error) return { error: approvedItemsRes.error.message }

    const orders = ordersRes.data ?? []
    const ordersCreated = orders.length
    let ordersApproved = 0
    let pointsSpent = 0
    for (const o of orders) {
      if (o.status === 'approved') {
        ordersApproved += 1
        pointsSpent += Number(o.total_points ?? 0)
      }
    }

    const regears = regearRes.data ?? []
    const regearCreated = regears.length
    let regearApproved = 0
    let silverPaid = 0
    for (const r of regears) {
      if (r.status === 'approved') {
        regearApproved += 1
        // payout_silver 가 있으면 그걸 우선(요율 반영), 없으면 claimed_silver,
        // 최후 폴백으로 silver. regearPayoutSilver 헬퍼와 동일한 규칙.
        const paid = r.payout_silver ?? r.claimed_silver ?? r.silver ?? 0
        silverPaid += Number(paid)
      }
    }

    // (unique_name, enchant, quality) 단위로 묶어 수량·포인트 합산.
    interface ItemAgg {
      uniqueName: string
      enchant: number
      quality: number
      nameKo: string
      quantity: number
      points: number
    }
    const bucket = new Map<string, ItemAgg>()
    for (const row of approvedItemsRes.data ?? []) {
      const uniqueName = row.unique_name as string
      const enchant = row.enchant as number
      const quality = row.quality as number
      const key = `${uniqueName}@${enchant}#${quality}`
      const qty = Number(row.quantity ?? 0)
      const pts = Number(row.subtotal_points ?? 0)
      const cur = bucket.get(key)
      if (cur) {
        cur.quantity += qty
        cur.points += pts
      } else {
        bucket.set(key, {
          uniqueName,
          enchant,
          quality,
          nameKo: row.name_ko as string,
          quantity: qty,
          points: pts,
        })
      }
    }
    const topSoldItems = Array.from(bucket.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)

    return {
      stats: {
        windowDays: SHOP_REGEAR_WINDOW_DAYS,
        ordersCreated,
        ordersApproved,
        pointsSpent,
        ordersPending: pendingOrdersRes.count ?? 0,
        regearCreated,
        regearApproved,
        silverPaid,
        regearPending: pendingRegearRes.count ?? 0,
        topSoldItems,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export interface VerificationMember {
  discordId: string
  username: string
  avatar: string | null
  isAdmin: boolean
  server: AlbionServer | null
  nickname: string | null
  guildId: string | null
  verifiedAt: string | null
  // guild_id 가 홈 길드와 일치하는지 — UI 에서 "길드 매칭" 배지로 사용.
  guildMatchesHome: boolean
}

export interface VerificationStats {
  totalActive: number
  // albion_server IS NULL (= 온보딩 한 번도 열지 않음).
  onboardingPending: number
  // server 는 골랐지만 verified_at 이 null (수동 입력 또는 길드 불일치).
  unverified: number
  // verified_at IS NOT NULL.
  verified: number
  homeGuildConfigured: boolean
  // 온보딩 미완료 + 미인증 멤버 목록 — 관리자가 바로 식별할 수 있게 탑 N.
  pendingMembers: VerificationMember[]
  unverifiedMembers: VerificationMember[]
}

export async function getAlbionVerificationStats(): Promise<{
  stats?: VerificationStats
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const [avatarsRes, homeGuildId] = await Promise.all([
      db
        .from('guild_avatars')
        .select(
          'discord_id, username, avatar, is_admin, withdrawn_at, albion_server, albion_nickname, albion_player_id, albion_guild_id, albion_verified_at',
        )
        .eq('guild_id', guildId),
      getAppSetting('albion_home_guild_id', ''),
    ])
    if (avatarsRes.error) return { error: avatarsRes.error.message }

    const rows = (avatarsRes.data ?? []).filter((a) => !a.withdrawn_at)
    const home = homeGuildId.trim()

    let onboardingPending = 0
    let unverified = 0
    let verified = 0
    const pendingMembers: VerificationMember[] = []
    const unverifiedMembers: VerificationMember[] = []

    for (const a of rows) {
      const server = (a.albion_server ?? null) as AlbionServer | null
      const guildId = (a.albion_guild_id ?? null) as string | null
      const guildMatchesHome = Boolean(home) && guildId === home
      const entry: VerificationMember = {
        discordId: a.discord_id as string,
        username: (a.username as string) ?? '이름 미상',
        avatar: (a.avatar as string | null) ?? null,
        isAdmin: Boolean(a.is_admin),
        server,
        nickname: (a.albion_nickname as string | null) ?? null,
        guildId,
        verifiedAt: (a.albion_verified_at as string | null) ?? null,
        guildMatchesHome,
      }
      if (!server) {
        onboardingPending += 1
        pendingMembers.push(entry)
        continue
      }
      if (entry.verifiedAt) {
        verified += 1
      } else {
        unverified += 1
        unverifiedMembers.push(entry)
      }
    }

    // 관리자가 상단에서 즉시 식별할 수 있도록 이름순 정렬.
    pendingMembers.sort((a, b) => a.username.localeCompare(b.username))
    unverifiedMembers.sort((a, b) => a.username.localeCompare(b.username))

    return {
      stats: {
        totalActive: rows.length,
        onboardingPending,
        unverified,
        verified,
        homeGuildConfigured: home.length > 0,
        pendingMembers: pendingMembers.slice(0, 50),
        unverifiedMembers: unverifiedMembers.slice(0, 50),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 관리자가 특정 멤버의 알비온 필드를 전부 초기화한다. 다음 사이트 방문 시
// layout 게이트가 albion_server IS NULL 을 감지해 온보딩 모달을 다시 띄운다.
// 수동 입력 상태(비인증) 인 사람을 재인증시키거나, 잘못 입력한 캐릭터를 지우는
// 관리자 조치. guild_avatars.username 은 건드리지 않는다 — 디스코드 세션이
// 참조하는 기본 값이라 복구 시점에 자동으로 덮어써진다.
export async function resetMemberAlbionOnboarding(
  discordId: string,
): Promise<{ ok?: true; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('guild_avatars')
      .update({
        albion_server: null,
        albion_player_id: null,
        albion_nickname: null,
        albion_guild_id: null,
        albion_verified_at: null,
      })
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/stats')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 재정 흐름 집계 창: 30일. 월간 부채 추이 감시 용도로 적절한 기간.
const FINANCE_WINDOW_DAYS = 30

export interface FinanceDayPoint {
  // Asia/Seoul 기준 YYYY-MM-DD 키. 타임존 일관성을 위해 동일 로직 사용.
  date: string
  earned: number
  spent: number
}

export interface FinanceReasonBreakdown {
  reason: string
  total: number
  count: number
}

export interface FinanceFlowStats {
  windowDays: number
  // 창 내 발행된 총 포인트 (양수 delta 합).
  totalEarned: number
  // 창 내 소멸된 총 포인트 (음수 delta 절대값 합).
  totalSpent: number
  // earned - spent. 양수면 창 내 유통량 증가, 음수면 감소.
  netFlow: number
  // 일별 in/out 타임라인. 날짜 누락 구간은 0,0 으로 채움.
  daily: FinanceDayPoint[]
  // 발행 출처별 분해. 수치 내림차순.
  sources: FinanceReasonBreakdown[]
  // 소비처별 분해. 수치 내림차순.
  sinks: FinanceReasonBreakdown[]
}

function seoulDateKey(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !day) return null
  return `${y}-${m}-${day}`
}

function buildDateSpine(days: number): string[] {
  const spine: string[] = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    const ts = now - i * 24 * 60 * 60 * 1000
    const key = seoulDateKey(new Date(ts).toISOString())
    if (key) spine.push(key)
  }
  return spine
}

export async function getFinanceFlowStats(): Promise<{
  stats?: FinanceFlowStats
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const since = daysAgoIso(FINANCE_WINDOW_DAYS)

    const ledgerRes = await db
      .from('point_ledger')
      .select('delta, reason, created_at')
      .eq('guild_id', guildId)
      .gte('created_at', since)
    if (ledgerRes.error) return { error: ledgerRes.error.message }

    const rows = ledgerRes.data ?? []

    let totalEarned = 0
    let totalSpent = 0
    const dayMap = new Map<string, { earned: number; spent: number }>()
    const sourceMap = new Map<string, { total: number; count: number }>()
    const sinkMap = new Map<string, { total: number; count: number }>()

    for (const row of rows) {
      const delta = Number(row.delta ?? 0)
      if (!Number.isFinite(delta) || delta === 0) continue
      const reason = typeof row.reason === 'string' ? row.reason : 'unknown'
      const createdAt = typeof row.created_at === 'string' ? row.created_at : null
      if (!createdAt) continue
      const dateKey = seoulDateKey(createdAt)
      if (!dateKey) continue

      const dayBucket = dayMap.get(dateKey) ?? { earned: 0, spent: 0 }
      if (delta > 0) {
        totalEarned += delta
        dayBucket.earned += delta
        const s = sourceMap.get(reason) ?? { total: 0, count: 0 }
        s.total += delta
        s.count += 1
        sourceMap.set(reason, s)
      } else {
        const abs = -delta
        totalSpent += abs
        dayBucket.spent += abs
        const s = sinkMap.get(reason) ?? { total: 0, count: 0 }
        s.total += abs
        s.count += 1
        sinkMap.set(reason, s)
      }
      dayMap.set(dateKey, dayBucket)
    }

    const daily: FinanceDayPoint[] = buildDateSpine(FINANCE_WINDOW_DAYS).map(
      (date) => {
        const b = dayMap.get(date) ?? { earned: 0, spent: 0 }
        return { date, earned: b.earned, spent: b.spent }
      },
    )

    const sources: FinanceReasonBreakdown[] = Array.from(sourceMap.entries())
      .map(([reason, v]) => ({ reason, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)
    const sinks: FinanceReasonBreakdown[] = Array.from(sinkMap.entries())
      .map(([reason, v]) => ({ reason, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total)

    return {
      stats: {
        windowDays: FINANCE_WINDOW_DAYS,
        totalEarned,
        totalSpent,
        netFlow: totalEarned - totalSpent,
        daily,
        sources,
        sinks,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
