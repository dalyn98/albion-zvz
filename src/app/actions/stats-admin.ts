'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/auth'
import { CAP } from '@/lib/permissions'
import { getAppSetting } from '@/lib/app-settings'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getTranslations } from 'next-intl/server'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import type {
  AlbionIdentityRelation,
  AlbionIdentityTrustStatus,
} from '@/lib/account-albion-identity'
import {
  classifyAlbionVerification,
  normalizeAlbionIdentityRelation,
  normalizeAlbionIdentityTrustStatus,
} from '@/lib/albion-verification-status'
import {
  listGuildPointBalanceSummaries,
  listGuildPointFlowRowsSince,
} from '@/lib/point-ledger'
import { canonicalShopQuality } from '@/lib/shop/quality'

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

// 이벤트 신청/배정 집계 창: 과거 30일. 실제 전투 참여는 event-report 의
// raw_battle 대조와 리더보드/멤버 상세의 battle participation 지표가 담당한다.
const PARTICIPATION_WINDOW_DAYS = 30
// 상점/리기어 트렌드 창: 과거 7일. 주문·리기어 쪽은 단기 신호가 중요.
const SHOP_REGEAR_WINDOW_DAYS = 7

export interface TopAttendee {
  discordId: string
  username: string
  avatar: string | null
  isAdmin: boolean
  // 최근 30일 동안 슬롯을 신청/배정받은 서로 다른 event 수.
  eventCount: number
}

export interface EventStats {
  windowDays: number
  // 창 내 생성된 이벤트 수.
  totalEvents: number
  // 창 내 최소 1회라도 슬롯을 신청/배정받은 고유 길드원 수.
  activeMembers: number
  // 전체 등록 길드원(guild_avatars) 수 — 참여율 분모.
  totalMembers: number
  // activeMembers / totalMembers (0~1). 슬롯 신청/배정률이며 전투 확인 참석률이 아니다.
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
  const tCommon = await getTranslations('common')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireCapability(CAP.STATS_VIEW)
    const guildId = await getSessionGuildId(session)
    const [balanceRes, avatarsRes] = await Promise.all([
      listGuildPointBalanceSummaries(db, guildId),
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, is_admin, withdrawn_at')
        .eq('guild_id', guildId),
    ])
    if (balanceRes.error) return { error: balanceRes.error }
    if (avatarsRes.error) return { error: avatarsRes.error.message }

    const rows = balanceRes.rows
    const avatars = avatarsRes.data ?? []
    let lifetimeEarned = 0
    let lifetimeSpent = 0
    for (const row of rows) {
      lifetimeEarned += row.lifetimeEarned
      lifetimeSpent += row.lifetimeSpent
    }

    // 이름/아바타 매칭 — 원장에만 있고 guild_avatars 에 없는 유저(탈퇴한 멤버)
    // 는 "이름 미상" 으로 떨어뜨리지만 합계에는 여전히 포함시킨다. 포인트
    // 부채는 discord_id 기준이지 avatar 동기화 상태에 의존하지 않기 때문.
    const avatarsByDiscord = new Map(avatars.map((a) => [a.discord_id, a]))

    const topHolders: TopHolder[] = []
    const withdrawnHolders: TopHolder[] = []
    let totalHeld = 0
    let withdrawnHeld = 0
    let entriesCount = 0
    for (const row of rows) {
      totalHeld += row.balance
      entriesCount += row.entriesCount
      // 보유 포인트가 0 이하인 사람은 "top" 에서 제외 — 0 이면 표시 가치 없고,
      // 음수면 이상 상태(관리자 조정 중) 이므로 별도 섹션이 필요하면 추후에.
      if (row.balance <= 0) continue
      const a = avatarsByDiscord.get(row.discordId)
      const entry: TopHolder = {
        discordId: row.discordId,
        username: a?.username ?? tCommon('unknownName'),
        avatar: a?.avatar ?? null,
        isAdmin: a?.is_admin ?? false,
        balance: row.balance,
      }
      // 탈퇴자는 별도 섹션으로. guild_avatars 에 없는 경우(= 레거시, avatar 미등록)
      // 는 "정상" 으로 간주 — 이 케이스는 게스트/과거 로그인 없이 ledger 만 쌓인
      // 엣지케이스라 탈퇴 분류에 포함시키면 오히려 혼동된다.
      if (a?.withdrawn_at) {
        withdrawnHolders.push(entry)
        withdrawnHeld += row.balance
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
        entriesCount,
        memberCount: rows.length,
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
  const tCommon = await getTranslations('common')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireCapability(CAP.STATS_VIEW)
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
        username: a?.username ?? tCommon('unknownName'),
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
    const db = await requireCapability(CAP.STATS_VIEW)
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

    // (unique_name, enchant) 단위로 묶어 수량·포인트 합산.
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
      const key = `${uniqueName}@${enchant}`
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
          quality: canonicalShopQuality(),
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
  guildName: string | null
  allianceName: string | null
  verifiedAt: string | null
  trustedAt: string | null
  relation: AlbionIdentityRelation
  trustStatus: AlbionIdentityTrustStatus
  statusReason: string | null
  lastSyncedAt: string | null
  // guild_id 가 홈 길드와 일치하는지 — UI 에서 "길드 매칭" 배지로 사용.
  guildMatchesHome: boolean
}

export interface VerificationStats {
  totalActive: number
  // albion_server IS NULL (= 온보딩 한 번도 열지 않음).
  onboardingPending: number
  // server 는 골랐지만 verified_at 이 null (수동 입력 또는 길드 불일치).
  unverified: number
  // 홈 길드 trusted 상태. 재화 기능까지 허용된다.
  verified: number
  // 같은 연합으로 확인된 상태. 이벤트 참여는 가능하지만 재화 기능은 제한된다.
  allianceVerified: number
  // roster matched but not admin-trusted yet, plus disputed duplicate claims.
  needsReview: number
  homeGuildConfigured: boolean
  // 온보딩 미완료 + 미인증 멤버 목록 — 관리자가 바로 식별할 수 있게 탑 N.
  pendingMembers: VerificationMember[]
  reviewMembers: VerificationMember[]
  allianceMembers: VerificationMember[]
  unverifiedMembers: VerificationMember[]
  // 인증 완료 멤버 — 관리자가 "다른 캐릭터로 갈아타고 싶다" 같은 케이스에서
  // 재인증 트리거할 수 있도록 노출. CollapsibleList 가 기본 collapse 처리.
  verifiedMembers: VerificationMember[]
  canManageIdentityReview: boolean
}

export async function getAlbionVerificationStats(): Promise<{
  stats?: VerificationStats
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  const tCommon = await getTranslations('common')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireCapability(CAP.STATS_VIEW)
    const guildId = await getSessionGuildId(session)
    const canManageIdentityReview = session.isAdmin || sessionHas(session, CAP.MEMBERS_MANAGE)
    const [avatarsRes, linksRes, homeGuildId] = await Promise.all([
      db
        .from('guild_avatars')
        .select(
          'discord_id, username, avatar, is_admin, withdrawn_at, albion_server, albion_nickname, albion_player_id, albion_guild_id, albion_verified_at',
        )
        .eq('guild_id', guildId),
      db
        .from('account_albion_tenant_links')
        .select(
          'discord_id, albion_server, albion_player_name, current_guild_id, current_guild_name, current_alliance_name, relation, trust_status, status_reason, trusted_at, last_synced_at',
        )
        .eq('guild_id', guildId),
      getAppSetting('albion_home_guild_id', '', guildId),
    ])
    if (avatarsRes.error) return { error: avatarsRes.error.message }
    const linkRows = linksRes.error ? [] : linksRes.data ?? []
    const linkMap = new Map(
      linkRows.map((row) => [
        row.discord_id as string,
        {
          server: isAlbionServer(row.albion_server) ? row.albion_server : null,
          nickname: (row.albion_player_name as string | null) ?? null,
          guildId: (row.current_guild_id as string | null) ?? null,
          guildName: (row.current_guild_name as string | null) ?? null,
          allianceName: (row.current_alliance_name as string | null) ?? null,
          relation: normalizeAlbionIdentityRelation(row.relation),
          trustStatus: normalizeAlbionIdentityTrustStatus(row.trust_status),
          statusReason: (row.status_reason as string | null) ?? null,
          trustedAt: (row.trusted_at as string | null) ?? null,
          lastSyncedAt: (row.last_synced_at as string | null) ?? null,
        },
      ]),
    )

    const rows = (avatarsRes.data ?? []).filter((a) => !a.withdrawn_at)
    const home = homeGuildId.trim()

    let onboardingPending = 0
    let unverified = 0
    let verified = 0
    let allianceVerified = 0
    let needsReview = 0
    const pendingMembers: VerificationMember[] = []
    const reviewMembers: VerificationMember[] = []
    const allianceMembers: VerificationMember[] = []
    const unverifiedMembers: VerificationMember[] = []
    const verifiedMembers: VerificationMember[] = []

    for (const a of rows) {
      const link = linkMap.get(a.discord_id as string)
      const avatarServer = isAlbionServer(a.albion_server) ? a.albion_server : null
      const server = avatarServer ?? link?.server ?? null
      const memberGuildId = ((a.albion_guild_id ?? null) as string | null) ?? link?.guildId ?? null
      const guildMatchesHome = Boolean(home) && memberGuildId === home
      const fallbackTrust: AlbionIdentityTrustStatus = a.albion_verified_at ? 'trusted' : 'claimed'
      const trustStatus = link?.trustStatus ?? fallbackTrust
      const relation = link?.relation ?? (guildMatchesHome ? 'home_guild' : memberGuildId ? 'external' : 'unknown')
      const entry: VerificationMember = {
        discordId: a.discord_id as string,
        username: (a.username as string) ?? tCommon('unknownName'),
        avatar: (a.avatar as string | null) ?? null,
        isAdmin: Boolean(a.is_admin),
        server,
        nickname: ((a.albion_nickname as string | null) ?? null) ?? link?.nickname ?? null,
        guildId: memberGuildId,
        guildName: link?.guildName ?? null,
        allianceName: link?.allianceName ?? null,
        verifiedAt: (a.albion_verified_at as string | null) ?? null,
        trustedAt: link?.trustedAt ?? ((a.albion_verified_at as string | null) ?? null),
        relation,
        trustStatus,
        statusReason: link?.statusReason ?? null,
        lastSyncedAt: link?.lastSyncedAt ?? null,
        guildMatchesHome,
      }
      switch (classifyAlbionVerification({ server, relation, trustStatus })) {
        case 'onboarding_pending':
          onboardingPending += 1
          pendingMembers.push(entry)
          break
        case 'needs_review':
          needsReview += 1
          reviewMembers.push(entry)
          break
        case 'guild_verified':
          verified += 1
          verifiedMembers.push(entry)
          break
        case 'alliance_verified':
          allianceVerified += 1
          allianceMembers.push(entry)
          break
        case 'unverified':
          unverified += 1
          unverifiedMembers.push(entry)
          break
      }
    }

    // 관리자가 상단에서 즉시 식별할 수 있도록 이름순 정렬.
    pendingMembers.sort((a, b) => a.username.localeCompare(b.username))
    reviewMembers.sort((a, b) => a.username.localeCompare(b.username))
    allianceMembers.sort((a, b) => a.username.localeCompare(b.username))
    unverifiedMembers.sort((a, b) => a.username.localeCompare(b.username))
    verifiedMembers.sort((a, b) => a.username.localeCompare(b.username))

    return {
      stats: {
        totalActive: rows.length,
        onboardingPending,
        unverified,
        verified,
        allianceVerified,
        needsReview,
        homeGuildConfigured: home.length > 0,
        pendingMembers: pendingMembers.slice(0, 50),
        reviewMembers: reviewMembers.slice(0, 100),
        allianceMembers: allianceMembers.slice(0, 100),
        unverifiedMembers: unverifiedMembers.slice(0, 50),
        // 인증 완료 멤버는 길드 규모에 따라 100+ 가능 — 200 cap 으로 페이로드
        // 보호. CollapsibleList 가 기본 8행으로 접어 노출 부담 줄인다.
        verifiedMembers: verifiedMembers.slice(0, 200),
        canManageIdentityReview,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function approveMemberAlbionIdentity(
  discordId: string,
): Promise<{ ok?: true; error?: string }> {
  return updateMemberAlbionTrust(discordId, 'trusted', 'admin_approved')
}

export async function disputeMemberAlbionIdentity(
  discordId: string,
): Promise<{ ok?: true; error?: string }> {
  return updateMemberAlbionTrust(discordId, 'disputed', 'admin_disputed')
}

function revalidateAlbionIdentitySurfaces(discordId: string): void {
  revalidatePath('/admin/dashboard')
  revalidatePath('/admin/dashboard/stats')
  revalidatePath(`/members/${discordId}`)
  revalidatePath('/me')
  revalidatePath('/me/profile')
  revalidatePath('/me/siphon')
  revalidatePath('/', 'layout')
}

async function updateMemberAlbionTrust(
  discordId: string,
  trustStatus: 'trusted' | 'disputed',
  reason: string,
): Promise<{ ok?: true; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireCapability(CAP.MEMBERS_MANAGE)
    const guildId = await getSessionGuildId(session)
    const nowIso = new Date().toISOString()

    const { data: link, error: linkError } = await db
      .from('account_albion_tenant_links')
      .select('profile_id, relation, verified_at')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .maybeSingle()
    if (linkError) return { error: linkError.message }
    if (!link) return { error: tErr('memberNotFound') }

    const relation = normalizeAlbionIdentityRelation(link.relation)
    const verifiedAt =
      relation === 'home_guild' && trustStatus === 'trusted'
        ? ((link.verified_at as string | null) ?? nowIso)
        : null

    const { error: updateError } = await db
      .from('account_albion_tenant_links')
      .update({
        trust_status: trustStatus,
        status_reason: reason,
        trusted_at: trustStatus === 'trusted' ? nowIso : null,
        disputed_at: trustStatus === 'disputed' ? nowIso : null,
        verified_at: verifiedAt,
        updated_at: nowIso,
      })
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
    if (updateError) return { error: updateError.message }

    const { error: avatarError } = await db
      .from('guild_avatars')
      .update({ albion_verified_at: verifiedAt })
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
    if (avatarError) return { error: avatarError.message }

    await db.from('account_albion_identity_audit').insert({
      guild_id: guildId,
      discord_id: discordId,
      profile_id: (link.profile_id as string | null) ?? null,
      actor_discord_id: session.discordId,
      action: trustStatus === 'trusted' ? 'admin_approve' : 'admin_dispute',
      trust_status: trustStatus,
      relation,
      reason,
    })

    revalidateAlbionIdentitySurfaces(discordId)
    return { ok: true }
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
    const db = await requireCapability(CAP.MEMBERS_MANAGE)
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
    const nowIso = new Date().toISOString()
    await db
      .from('account_albion_tenant_links')
      .update({
        trust_status: 'revoked',
        status_reason: 'admin_reset',
        revoked_at: nowIso,
        verified_at: null,
        trusted_at: null,
        updated_at: nowIso,
      })
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
    revalidateAlbionIdentitySurfaces(discordId)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 재정 흐름 집계 창: 30일. 월간 부채 추이 감시 용도로 적절한 기간.
const FINANCE_WINDOW_DAYS = 30

export interface FinanceDayPoint {
  // 테넌트 시간대 기준 YYYY-MM-DD 키. 길드 운영 시간대(KR/EU/NA/SA) 의 자정으로
  // 일자가 끊긴다. 타임존 일관성을 위해 차트 라벨/누적 키가 동일 로직 사용.
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

function tenantDateKey(iso: string, tz: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
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

function buildDateSpine(days: number, tz: string): string[] {
  const spine: string[] = []
  const now = Date.now()
  for (let i = days - 1; i >= 0; i--) {
    const ts = now - i * 24 * 60 * 60 * 1000
    const key = tenantDateKey(new Date(ts).toISOString(), tz)
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
    const db = await requireCapability(CAP.STATS_VIEW)
    const guildId = await getSessionGuildId(session)
    const tz = await getTenantTimezone(guildId)
    const since = daysAgoIso(FINANCE_WINDOW_DAYS)

    const ledgerRes = await listGuildPointFlowRowsSince(db, guildId, since)
    if (ledgerRes.error) return { error: ledgerRes.error }

    const rows = ledgerRes.rows

    let totalEarned = 0
    let totalSpent = 0
    const dayMap = new Map<string, { earned: number; spent: number }>()
    const sourceMap = new Map<string, { total: number; count: number }>()
    const sinkMap = new Map<string, { total: number; count: number }>()

    for (const row of rows) {
      const delta = Number(row.delta ?? 0)
      if (!Number.isFinite(delta) || delta === 0) continue
      const reason = row.reason
      const createdAt = row.createdAt
      if (!createdAt) continue
      const dateKey = tenantDateKey(createdAt, tz)
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

    const daily: FinanceDayPoint[] = buildDateSpine(FINANCE_WINDOW_DAYS, tz).map(
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
