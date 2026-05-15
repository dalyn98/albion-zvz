// 데모 통계 시드 — /demo/stats, dashboard 위젯, finance-flow 차트 등에서 사용.
// DEMO_MEMBERS / DEMO_ADMIN_BADGES 에 의존해 파생값으로 만든다.

import { DEMO_MEMBERS } from './members'
import { DEMO_ADMIN_BADGES } from './approvals'

// 대시보드 상단 주간 요약.
export type DemoWeeklyStats = {
  events: number
  kills: number
  deaths: number
  activeMembers: number
  regearsApproved: number
  silverPaid: number
}

export const DEMO_WEEKLY_STATS: DemoWeeklyStats = {
  events: 7,
  kills: 412,
  deaths: 168,
  activeMembers: 9,
  regearsApproved: 12,
  silverPaid: 4_820_000,
}

// 포인트 보유 상위 (Top Holders) — DEMO_MEMBERS 의 points 내림차순.
export type DemoTopHolder = {
  ign: string
  discordId: string
  balance: number
  isAdmin: boolean
}

export const DEMO_TOP_HOLDERS: DemoTopHolder[] = [...DEMO_MEMBERS]
  .sort((a, b) => b.points - a.points)
  .map((m) => ({
    ign: m.ign,
    discordId: m.discordId,
    balance: m.points,
    isAdmin: m.role === 'admin',
  }))

export type DemoPointStats = {
  totalHeld: number
  lifetimeEarned: number
  lifetimeSpent: number
  memberCount: number
  entriesCount: number
  withdrawnHeld: number
  withdrawnHolders: DemoTopHolder[]
}

export const DEMO_POINT_STATS: DemoPointStats = {
  totalHeld: DEMO_TOP_HOLDERS.reduce((sum, h) => sum + h.balance, 0),
  lifetimeEarned: 84_320,
  lifetimeSpent: 59_600,
  memberCount: DEMO_MEMBERS.length,
  entriesCount: 312,
  withdrawnHeld: 1_240,
  withdrawnHolders: [
    { ign: 'Hyacinth', discordId: 'demo-hyacinth', balance: 720, isAdmin: false },
    { ign: 'Pinemoss', discordId: 'demo-pinemoss', balance: 520, isAdmin: false },
  ],
}

// FinanceFlow — 14일 윈도우의 일별 earned/spent + reason별 누계.
export type DemoFinanceDaily = {
  date: string // 표시용 ISO 부분
  earned: number
  spent: number
}

export type DemoFinanceReason = {
  reason: string
  total: number
  count: number
}

export type DemoFinanceFlowStats = {
  windowDays: number
  totalEarned: number
  totalSpent: number
  netFlow: number
  daily: DemoFinanceDaily[]
  sources: DemoFinanceReason[]
  sinks: DemoFinanceReason[]
}

// 14일 일별 — 이벤트가 있는 날에 earned 가 spike, 환전/상점은 꾸준.
export const DEMO_FINANCE_FLOW_STATS: DemoFinanceFlowStats = {
  windowDays: 14,
  totalEarned: 18_420,
  totalSpent: 12_840,
  netFlow: 18_420 - 12_840,
  daily: [
    { date: '2026-04-23', earned: 600, spent: 320 },
    { date: '2026-04-24', earned: 1_400, spent: 280 },
    { date: '2026-04-25', earned: 800, spent: 640 },
    { date: '2026-04-26', earned: 2_200, spent: 480 },
    { date: '2026-04-27', earned: 1_100, spent: 920 },
    { date: '2026-04-28', earned: 700, spent: 560 },
    { date: '2026-04-29', earned: 2_400, spent: 1_080 },
    { date: '2026-04-30', earned: 1_300, spent: 760 },
    { date: '2026-05-01', earned: 900, spent: 640 },
    { date: '2026-05-02', earned: 2_600, spent: 1_240 },
    { date: '2026-05-03', earned: 1_400, spent: 880 },
    { date: '2026-05-04', earned: 1_120, spent: 1_120 },
    { date: '2026-05-05', earned: 1_200, spent: 1_440 },
    { date: '2026-05-06', earned: 700, spent: 2_480 },
  ],
  sources: [
    { reason: 'regear_approved', total: 8_640, count: 42 },
    { reason: 'donation_approved', total: 6_300, count: 6 },
    { reason: 'transfer_in', total: 2_180, count: 8 },
    { reason: 'admin_adjust', total: 1_300, count: 3 },
  ],
  sinks: [
    { reason: 'exchange_paid', total: 6_800, count: 18 },
    { reason: 'shop_purchase', total: 4_240, count: 26 },
    { reason: 'transfer_out', total: 1_800, count: 4 },
  ],
}

// Verification — 길드원 알비온 닉네임/홈길드 인증 상태.
export type DemoVerificationMember = {
  ign: string
  discordId: string
  isAdmin: boolean
  // 인증된 알비온 닉네임 (없으면 null).
  nickname: string | null
  // 길드 매칭 상태.
  guildMatchesHome: boolean | null
  // 서버 코드 (UI 라벨용 stub).
  server: 'east' | 'west' | 'europe' | null
  guildId: string | null
}

export type DemoVerificationStats = {
  totalActive: number
  verified: number
  unverified: number
  onboardingPending: number
  homeGuildConfigured: boolean
  pendingMembers: DemoVerificationMember[]
  unverifiedMembers: DemoVerificationMember[]
  verifiedMembers: DemoVerificationMember[]
}

// 멘헤라 길드 기준: 7명 verified (길드 매칭) / 1명 unverified (다른 길드) / 1명 onboarding 미완.
export const DEMO_VERIFICATION_STATS: DemoVerificationStats = {
  totalActive: DEMO_MEMBERS.length,
  verified: 8,
  unverified: 1,
  onboardingPending: 1,
  homeGuildConfigured: true,
  pendingMembers: [
    {
      ign: 'Borin',
      discordId: 'demo-borin',
      isAdmin: false,
      nickname: null,
      guildMatchesHome: null,
      server: null,
      guildId: null,
    },
  ],
  unverifiedMembers: [
    {
      ign: 'Vexa',
      discordId: 'demo-vexa',
      isAdmin: false,
      nickname: 'Vexa',
      guildMatchesHome: false,
      server: 'east',
      guildId: 'demo-other-guild',
    },
  ],
  verifiedMembers: DEMO_MEMBERS.filter((m) => m.ign !== 'Borin' && m.ign !== 'Vexa').map((m) => ({
    ign: m.ign,
    discordId: m.discordId,
    isAdmin: m.role === 'admin',
    nickname: m.ign,
    guildMatchesHome: true,
    server: 'east',
    guildId: 'demo-home-guild',
  })),
}

// Event participation — 30일 윈도우.
export type DemoTopAttendee = {
  ign: string
  discordId: string
  isAdmin: boolean
  eventCount: number
}

export type DemoEventStats = {
  windowDays: number
  totalEvents: number
  totalMembers: number
  activeMembers: number
  participationRate: number
  topAttendees: DemoTopAttendee[]
}

export const DEMO_EVENT_STATS: DemoEventStats = {
  windowDays: 30,
  totalEvents: 28,
  totalMembers: DEMO_MEMBERS.length,
  activeMembers: 9,
  participationRate: 0.9,
  topAttendees: [...DEMO_MEMBERS]
    .map((m) => ({
      ign: m.ign,
      discordId: m.discordId,
      isAdmin: m.role === 'admin',
      // 30일 윈도우 추정: weeklyAttendance 의 attended/7 비율 × windowDays.
      eventCount: Math.round((m.weeklyAttendance.attended / 7) * 28),
    }))
    .sort((a, b) => b.eventCount - a.eventCount),
}

// Shop + Regear summary (30일 윈도우) — 어드민 stats 의 ShopRegear 섹션.
export type DemoTopSoldItem = {
  uniqueName: string
  enchant: number
  quality: number
  nameKo: string
  quantity: number
  points: number
}

export type DemoShopRegearStats = {
  windowDays: number
  ordersCreated: number
  ordersApproved: number
  ordersPending: number
  pointsSpent: number
  regearCreated: number
  regearApproved: number
  regearPending: number
  silverPaid: number
  topSoldItems: DemoTopSoldItem[]
}

export const DEMO_SHOP_REGEAR_STATS: DemoShopRegearStats = {
  windowDays: 30,
  ordersCreated: 64,
  ordersApproved: 58,
  ordersPending: DEMO_ADMIN_BADGES.shop,
  pointsSpent: 8_240,
  regearCreated: 142,
  regearApproved: 128,
  regearPending: DEMO_ADMIN_BADGES.regear,
  silverPaid: 18_420_000,
  topSoldItems: [
    {
      uniqueName: 'T8_2H_MACE_HEAVY',
      enchant: 3,
      quality: 3,
      nameKo: 'Heavy Mace',
      quantity: 18,
      points: 1_440,
    },
    {
      uniqueName: 'T8_2H_HOLYSTAFF_AVALON',
      enchant: 3,
      quality: 3,
      nameKo: 'Holy Staff',
      quantity: 14,
      points: 1_120,
    },
    {
      uniqueName: 'T8_2H_DAGGERPAIR',
      enchant: 3,
      quality: 3,
      nameKo: 'Dagger Pair',
      quantity: 12,
      points: 960,
    },
    {
      uniqueName: 'T8_2H_FIRESTAFF',
      enchant: 3,
      quality: 3,
      nameKo: 'Great Fire Staff',
      quantity: 10,
      points: 800,
    },
    {
      uniqueName: 'T8_2H_CROSSBOWLARGE',
      enchant: 3,
      quality: 3,
      nameKo: 'Heavy Crossbow',
      quantity: 8,
      points: 640,
    },
  ],
}
