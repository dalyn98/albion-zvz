// 데모 페이지 (`/demo/*`) 의 인라인 시드 데이터.
// 4 라우트 (dashboard, events, regear, members, stats) 를 read-only 로 채운다.
// 모든 데이터는 build-time 상수 — 사용자 인터랙션이 mutation 하지 않는다.
//
// i18n: 번역 가능한 라벨은 enum 키로 보관 (role/achievement/slotRole/day),
// 렌더 타임에 next-intl 로 풀어 사용. 고유명사 (IGN, 도시, 게임 아이템) 는 raw.

// ─────────────────────────────────────────────────────────────────
// Shared keys
// ─────────────────────────────────────────────────────────────────

export type DemoRelativeDay =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | 'd2ago'
  | 'd3ago'
  | 'd4ago'

export type DemoTimeLabel = {
  day: DemoRelativeDay
  time: string
}

export type DemoMemberRoleKey = 'admin' | 'caller' | 'member' | 'intern'

export type DemoSlotRoleKey = 'caller' | 'tank' | 'healer' | 'support' | 'dps'

export type DemoWeaponKey = 'mace' | 'fire' | 'lifestaff' | 'dagger' | 'crossbow'

export type DemoAchievementKey =
  | 'ironTank'
  | 'battles100'
  | 'battles50'
  | 'mvpMonth'
  | 'caller100'
  | 'undefeated5'
  | 'lightOfLife'
  | 'supportClassic'
  | 'daggerShadow'
  | 'kills100'
  | 'wayOfFlame'
  | 'sniperEye'
  | 'firstSortie'

// ─────────────────────────────────────────────────────────────────
// Members
// ─────────────────────────────────────────────────────────────────

export type DemoMember = {
  ign: string
  discordId: string
  role: DemoMemberRoleKey
  primaryWeapon: DemoWeaponKey
  points: number
  joinedDaysAgo: number
  lastEventId: string
  weeklyAttendance: { attended: number; total: number }
  recentRegears: number
  achievements: DemoAchievementKey[]
  kills: number
  deaths: number
  battles: number
  survivalPct: number
}

export const DEMO_MEMBERS: DemoMember[] = [
  {
    ign: 'Eternia',
    discordId: 'demo-eternia',
    role: 'admin',
    primaryWeapon: 'mace',
    points: 4_280,
    joinedDaysAgo: 412,
    lastEventId: 'evt-1',
    weeklyAttendance: { attended: 6, total: 7 },
    recentRegears: 3,
    achievements: ['ironTank', 'battles100', 'mvpMonth'],
    kills: 142,
    deaths: 32,
    battles: 174,
    survivalPct: 81,
  },
  {
    ign: 'Daewi',
    discordId: 'demo-daewi',
    role: 'caller',
    primaryWeapon: 'mace',
    points: 3_980,
    joinedDaysAgo: 384,
    lastEventId: 'evt-1',
    weeklyAttendance: { attended: 7, total: 7 },
    recentRegears: 2,
    achievements: ['caller100', 'undefeated5'],
    kills: 88,
    deaths: 18,
    battles: 106,
    survivalPct: 83,
  },
  {
    ign: 'MoonRabbit',
    discordId: 'demo-moonrabbit',
    role: 'member',
    primaryWeapon: 'lifestaff',
    points: 2_640,
    joinedDaysAgo: 268,
    lastEventId: 'evt-5',
    weeklyAttendance: { attended: 5, total: 7 },
    recentRegears: 1,
    achievements: ['lightOfLife', 'battles50'],
    kills: 24,
    deaths: 22,
    battles: 168,
    survivalPct: 87,
  },
  {
    ign: 'Mochi',
    discordId: 'demo-mochi',
    role: 'member',
    primaryWeapon: 'lifestaff',
    points: 2_120,
    joinedDaysAgo: 224,
    lastEventId: 'evt-1',
    weeklyAttendance: { attended: 4, total: 7 },
    recentRegears: 1,
    achievements: ['supportClassic'],
    kills: 12,
    deaths: 14,
    battles: 102,
    survivalPct: 86,
  },
  {
    ign: 'ShadowAce',
    discordId: 'demo-shadowace',
    role: 'member',
    primaryWeapon: 'dagger',
    points: 3_560,
    joinedDaysAgo: 198,
    lastEventId: 'evt-1',
    weeklyAttendance: { attended: 6, total: 7 },
    recentRegears: 4,
    achievements: ['daggerShadow', 'kills100'],
    kills: 188,
    deaths: 41,
    battles: 152,
    survivalPct: 73,
  },
  {
    ign: 'Frostpine',
    discordId: 'demo-frostpine',
    role: 'member',
    primaryWeapon: 'fire',
    points: 1_840,
    joinedDaysAgo: 162,
    lastEventId: 'evt-5',
    weeklyAttendance: { attended: 5, total: 7 },
    recentRegears: 2,
    achievements: ['wayOfFlame'],
    kills: 122,
    deaths: 38,
    battles: 126,
    survivalPct: 70,
  },
  {
    ign: 'Lumina',
    discordId: 'demo-lumina',
    role: 'member',
    primaryWeapon: 'lifestaff',
    points: 1_220,
    joinedDaysAgo: 88,
    lastEventId: 'evt-5',
    weeklyAttendance: { attended: 3, total: 7 },
    recentRegears: 0,
    achievements: [],
    kills: 18,
    deaths: 12,
    battles: 88,
    survivalPct: 86,
  },
  {
    ign: 'Vexa',
    discordId: 'demo-vexa',
    role: 'member',
    primaryWeapon: 'crossbow',
    points: 2_080,
    joinedDaysAgo: 142,
    lastEventId: 'evt-1',
    weeklyAttendance: { attended: 4, total: 7 },
    recentRegears: 1,
    achievements: ['sniperEye'],
    kills: 96,
    deaths: 22,
    battles: 84,
    survivalPct: 74,
  },
  {
    ign: 'Borin',
    discordId: 'demo-borin',
    role: 'intern',
    primaryWeapon: 'mace',
    points: 480,
    joinedDaysAgo: 22,
    lastEventId: 'evt-5',
    weeklyAttendance: { attended: 4, total: 7 },
    recentRegears: 1,
    achievements: ['firstSortie'],
    kills: 64,
    deaths: 18,
    battles: 78,
    survivalPct: 77,
  },
  {
    ign: 'NebulaQ',
    discordId: 'demo-nebulaq',
    role: 'member',
    primaryWeapon: 'fire',
    points: 2_520,
    joinedDaysAgo: 168,
    lastEventId: 'evt-5',
    weeklyAttendance: { attended: 5, total: 7 },
    recentRegears: 2,
    achievements: ['wayOfFlame'],
    kills: 142,
    deaths: 26,
    battles: 92,
    survivalPct: 72,
  },
]

// ─────────────────────────────────────────────────────────────────
// Events + Templates
// ─────────────────────────────────────────────────────────────────

export type DemoEventStatus = 'scheduled' | 'live' | 'ended'

// 실제 src/types EventCategory 와 동일한 라벨 셋 — 데모 카드도 home 의
// `home.sections.combat / .ff / .ganking` 키로 라벨링되어 같은 그루핑을 보여준다.
export type DemoEventCategory = '전투' | 'FF' | '갱킹'

// 실제 home 카드의 imminent/upcoming 분기. 데모 시드는 시간 계산 없이 명시적으로 선언.
export type DemoEventKind = 'imminent' | 'upcoming'

export type DemoEventSlot = {
  role: DemoSlotRoleKey
  buildLabel: string
  weapon: string
  flat: number
  assigned?: string
  isCaller?: boolean
}

export type DemoParty = {
  id: string
  name: string
  isBomb?: boolean
  slots: DemoEventSlot[]
}

export type DemoEventListItem = {
  id: string
  name: string
  scheduledAt: DemoTimeLabel
  templateLabel: string
  status: DemoEventStatus
  filledCount: number
  totalCount: number
  zone: string
  category: DemoEventCategory
  kind: DemoEventKind
  battleStarted?: boolean
}

export type DemoEventDetail = DemoEventListItem & {
  parties: DemoParty[]
  description: string
  organizer: string
}

export const DEMO_EVENTS: DemoEventListItem[] = [
  {
    id: 'evt-1',
    name: 'Roads 7v7 — Mercia Ore',
    scheduledAt: { day: 'today', time: '22:00' },
    templateLabel: 'Roads 7v7 — Standard',
    status: 'scheduled',
    filledCount: 5,
    totalCount: 7,
    zone: 'Black Zone — Mercia',
    category: '전투',
    kind: 'imminent',
  },
  {
    id: 'evt-2',
    name: 'Blackzone ZvZ — 20',
    scheduledAt: { day: 'tomorrow', time: '23:00' },
    templateLabel: 'Blackzone ZvZ — 20',
    status: 'scheduled',
    filledCount: 12,
    totalCount: 20,
    zone: 'Black Zone — Caerleon',
    category: '전투',
    kind: 'upcoming',
  },
  {
    id: 'evt-3',
    name: 'Hellgate 4v4 — Fame Farm',
    scheduledAt: { day: 'tomorrow', time: '21:00' },
    templateLabel: 'Hellgate 4v4',
    status: 'scheduled',
    filledCount: 4,
    totalCount: 4,
    zone: 'Hellgate — 4v4',
    category: 'FF',
    kind: 'upcoming',
  },
  {
    id: 'evt-6',
    name: 'Mercia Ganking 5v5',
    scheduledAt: { day: 'tomorrow', time: '20:00' },
    templateLabel: 'Ganking — Light',
    status: 'scheduled',
    filledCount: 3,
    totalCount: 5,
    zone: 'Black Zone — Mercia Roads',
    category: '갱킹',
    kind: 'upcoming',
  },
  {
    id: 'evt-4',
    name: 'Roads 7v7 — Mercia',
    scheduledAt: { day: 'yesterday', time: '22:00' },
    templateLabel: 'Roads 7v7 — Standard',
    status: 'ended',
    filledCount: 7,
    totalCount: 7,
    zone: 'Black Zone — Mercia',
    category: '전투',
    kind: 'upcoming',
    battleStarted: true,
  },
  {
    id: 'evt-5',
    name: 'Hellgate 4v4',
    scheduledAt: { day: 'd2ago', time: '22:14' },
    templateLabel: 'Hellgate 4v4',
    status: 'ended',
    filledCount: 4,
    totalCount: 4,
    zone: 'Hellgate',
    category: 'FF',
    kind: 'upcoming',
    battleStarted: true,
  },
]

export const DEMO_EVENT_DETAIL: DemoEventDetail = {
  id: 'evt-1',
  name: 'Roads 7v7 — Mercia Ore',
  scheduledAt: { day: 'today', time: '22:00' },
  templateLabel: 'Roads 7v7 — Standard',
  status: 'scheduled',
  filledCount: 5,
  totalCount: 7,
  zone: 'Black Zone — Mercia',
  category: '전투',
  kind: 'imminent',
  description: 'Mercia ore route — rally at 22:00 sharp.',
  organizer: 'Daewi',
  parties: [
    {
      id: 'party-main',
      name: 'Main Party',
      slots: [
        {
          role: 'caller',
          buildLabel: 'Heavy Mace · 8F',
          weapon: 'Heavy Mace',
          flat: 8,
          assigned: 'Daewi',
          isCaller: true,
        },
        {
          role: 'tank',
          buildLabel: 'Heavy Mace · 8F',
          weapon: 'Heavy Mace',
          flat: 8,
          assigned: 'Eternia',
        },
        {
          role: 'healer',
          buildLabel: 'Holy Staff · 8F',
          weapon: 'Holy Staff',
          flat: 8,
          assigned: 'MoonRabbit',
        },
        {
          role: 'support',
          buildLabel: 'Locus · 7F',
          weapon: 'Locus',
          flat: 7,
          assigned: 'Mochi',
        },
        {
          role: 'dps',
          buildLabel: 'Dagger Pair · 8F',
          weapon: 'Dagger Pair',
          flat: 8,
          assigned: 'ShadowAce',
        },
        {
          role: 'dps',
          buildLabel: 'Fire Staff · 8F',
          weapon: 'Great Fire Staff',
          flat: 8,
        },
        {
          role: 'dps',
          buildLabel: 'Crossbow · 8F',
          weapon: 'Heavy Crossbow',
          flat: 8,
        },
      ],
    },
  ],
}

// 어드민 대시보드의 "템플릿" 탭에서 보여주는 데모 시드.
// 실제 TemplateList 와 동일한 카드 외관 — 이름 / 인원 / 슬롯 라벨.
export type DemoTemplate = {
  id: string
  name: string
  totalSlots: number
  zoneHint: string
  description: string
}

export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: 'tpl-1',
    name: 'Roads 7v7 — Standard',
    totalSlots: 7,
    zoneHint: 'Roads / Black Zone',
    description: '메이스 콜러 + 탱 / 힐 / 서폿 / 단검 / 화염 / 석궁',
  },
  {
    id: 'tpl-2',
    name: 'Blackzone ZvZ — 20',
    totalSlots: 20,
    zoneHint: 'Black Zone — open field',
    description: '5인 메이스 + 5인 화염 + 4인 힐 / 서폿 + 6인 딜러 (단검/석궁)',
  },
  {
    id: 'tpl-3',
    name: 'Hellgate 4v4',
    totalSlots: 4,
    zoneHint: 'Hellgate (Fame Farm)',
    description: '단검 1 + 화염 1 + 힐 1 + 서폿 1',
  },
  {
    id: 'tpl-4',
    name: 'Ganking — Light',
    totalSlots: 5,
    zoneHint: 'Roads / 갱킹',
    description: '경량 무기 5인 — 단검 위주, 빠른 움직임',
  },
]

// ─────────────────────────────────────────────────────────────────
// Approvals — Regear / Exchange / Donation / Shop / Event payout / Craft
// ─────────────────────────────────────────────────────────────────

export type DemoRegearStatus = 'pending' | 'approved' | 'rejected'
export type DemoRegearOrigin = 'auto' | 'manual'
export type DemoRegearSlot = 'head' | 'armor' | 'shoes' | 'weapon' | 'offhand' | 'cape'

export type DemoRegearPiece = {
  slot: DemoRegearSlot
  itemLabel: string
  estimatedSilver: number
}

export type DemoRegearListItem = {
  id: string
  victim: string
  battleLabel: string
  diedAt: DemoTimeLabel
  killerName: string
  killerWeapon: string
  status: DemoRegearStatus
  origin: DemoRegearOrigin
  totalSilver: number
  // 추가: 승인 시 처리자 / 상한 대비 청구 비율 등.
  handledBy?: string
  capSilver?: number
}

export type DemoRegearDetail = DemoRegearListItem & {
  pieces: DemoRegearPiece[]
}

export const DEMO_REGEAR_LIST: DemoRegearListItem[] = [
  {
    id: 'rg-1',
    victim: 'Eternia',
    battleLabel: 'Black Zone — Hellgate 4v4',
    diedAt: { day: 'yesterday', time: '21:48' },
    killerName: 'Stormbringer',
    killerWeapon: 'Bedrock Mace',
    status: 'pending',
    origin: 'auto',
    totalSilver: 572_000,
    capSilver: 600_000,
  },
  {
    id: 'rg-2',
    victim: 'MoonRabbit',
    battleLabel: 'Black Zone — Mercia',
    diedAt: { day: 'today', time: '12:08' },
    killerName: 'Frostfang',
    killerWeapon: 'Permafrost Prism',
    status: 'pending',
    origin: 'auto',
    totalSilver: 512_000,
    capSilver: 520_000,
  },
  {
    id: 'rg-7',
    victim: 'Mochi',
    battleLabel: 'Black Zone — Mercia',
    diedAt: { day: 'today', time: '12:11' },
    killerName: 'Bloodfang',
    killerWeapon: 'Camlann Mace',
    status: 'pending',
    origin: 'manual',
    totalSilver: 318_000,
    capSilver: 380_000,
  },
  {
    id: 'rg-3',
    victim: 'ShadowAce',
    battleLabel: 'Black Zone — Mercia',
    diedAt: { day: 'today', time: '12:09' },
    killerName: 'DuskWalker',
    killerWeapon: 'Dagger Pair',
    status: 'approved',
    origin: 'auto',
    totalSilver: 430_000,
    handledBy: 'Eternia',
  },
  {
    id: 'rg-4',
    victim: 'Frostpine',
    battleLabel: 'Black Zone — Caerleon',
    diedAt: { day: 'd2ago', time: '22:33' },
    killerName: 'IceWraith',
    killerWeapon: 'Permafrost Prism',
    status: 'approved',
    origin: 'auto',
    totalSilver: 396_000,
    handledBy: 'Eternia',
  },
  {
    id: 'rg-5',
    victim: 'Vexa',
    battleLabel: 'Black Zone — Mercia',
    diedAt: { day: 'd3ago', time: '22:18' },
    killerName: 'Sniper',
    killerWeapon: 'Heavy Crossbow',
    status: 'approved',
    origin: 'manual',
    totalSilver: 352_000,
    handledBy: 'Daewi',
  },
  {
    id: 'rg-6',
    victim: 'Borin',
    battleLabel: 'Roads — 4v4',
    diedAt: { day: 'd4ago', time: '21:05' },
    killerName: 'Marauder',
    killerWeapon: 'Camlann Mace',
    status: 'rejected',
    origin: 'auto',
    totalSilver: 280_000,
    handledBy: 'Eternia',
  },
]

export const DEMO_REGEAR_DETAIL: DemoRegearDetail = {
  ...DEMO_REGEAR_LIST[0]!,
  pieces: [
    { slot: 'head', itemLabel: 'Specter Hood (8.1)', estimatedSilver: 128_000 },
    { slot: 'armor', itemLabel: 'Knight Armor (8.0)', estimatedSilver: 94_000 },
    { slot: 'shoes', itemLabel: 'Heretic Boots (8.0)', estimatedSilver: 76_000 },
    { slot: 'weapon', itemLabel: 'Heavy Mace (8.1)', estimatedSilver: 210_000 },
    { slot: 'cape', itemLabel: 'Lymhurst Cape (8.0)', estimatedSilver: 64_000 },
  ],
}

// 환전 (Exchange) 청구 시드. 길드원이 보유 포인트를 실버로 환전 요청한 건들.
export type DemoApprovalCommonStatus = 'pending' | 'approved' | 'rejected'

export type DemoExchangeRequest = {
  id: string
  member: string
  points: number
  silver: number
  ratePercent: number
  requestedAt: DemoTimeLabel
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_EXCHANGE_REQUESTS: DemoExchangeRequest[] = [
  {
    id: 'ex-1',
    member: 'ShadowAce',
    points: 800,
    silver: 800_000,
    ratePercent: 100,
    requestedAt: { day: 'today', time: '12:32' },
    status: 'pending',
  },
  {
    id: 'ex-2',
    member: 'NebulaQ',
    points: 500,
    silver: 500_000,
    ratePercent: 100,
    requestedAt: { day: 'today', time: '11:08' },
    status: 'pending',
  },
  {
    id: 'ex-3',
    member: 'Frostpine',
    points: 1_200,
    silver: 1_200_000,
    ratePercent: 100,
    requestedAt: { day: 'yesterday', time: '20:14' },
    status: 'approved',
    handledBy: 'Eternia',
  },
  {
    id: 'ex-4',
    member: 'Mochi',
    points: 300,
    silver: 300_000,
    ratePercent: 100,
    requestedAt: { day: 'd2ago', time: '21:42' },
    status: 'approved',
    handledBy: 'Daewi',
  },
]

// 기부 (Donation) 청구 시드. 길드원이 길드창에 기부한 실버를 포인트로 인정받는 건.
export type DemoDonationRequest = {
  id: string
  member: string
  silver: number
  points: number
  ratePercent: number
  requestedAt: DemoTimeLabel
  note: string
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_DONATION_REQUESTS: DemoDonationRequest[] = [
  {
    id: 'dn-1',
    member: 'Daewi',
    silver: 5_000_000,
    points: 5_000,
    ratePercent: 100,
    requestedAt: { day: 'today', time: '13:02' },
    note: '주간 길드 운영자금',
    status: 'pending',
  },
  {
    id: 'dn-2',
    member: 'Eternia',
    silver: 2_500_000,
    points: 2_500,
    ratePercent: 100,
    requestedAt: { day: 'yesterday', time: '23:50' },
    note: '리기어 풀 보충',
    status: 'approved',
    handledBy: 'Daewi',
  },
  {
    id: 'dn-3',
    member: 'NebulaQ',
    silver: 800_000,
    points: 800,
    ratePercent: 100,
    requestedAt: { day: 'd3ago', time: '22:18' },
    note: '소규모 기부',
    status: 'approved',
    handledBy: 'Eternia',
  },
]

// 상점 주문 (Shop order) 시드. 포인트로 길드 상점 아이템을 구매한 건.
export type DemoShopOrder = {
  id: string
  member: string
  itemLabel: string
  itemEnchant: number
  quantity: number
  pointsTotal: number
  requestedAt: DemoTimeLabel
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_SHOP_ORDERS: DemoShopOrder[] = [
  {
    id: 'so-1',
    member: 'Lumina',
    itemLabel: 'Holy Staff',
    itemEnchant: 3,
    quantity: 1,
    pointsTotal: 280,
    requestedAt: { day: 'today', time: '13:18' },
    status: 'pending',
  },
  {
    id: 'so-2',
    member: 'Borin',
    itemLabel: 'Heavy Mace',
    itemEnchant: 2,
    quantity: 2,
    pointsTotal: 320,
    requestedAt: { day: 'today', time: '12:55' },
    status: 'pending',
  },
  {
    id: 'so-3',
    member: 'Vexa',
    itemLabel: 'Heavy Crossbow',
    itemEnchant: 3,
    quantity: 1,
    pointsTotal: 240,
    requestedAt: { day: 'yesterday', time: '21:34' },
    status: 'approved',
    handledBy: 'Eternia',
  },
  {
    id: 'so-4',
    member: 'Mochi',
    itemLabel: 'Locus',
    itemEnchant: 2,
    quantity: 1,
    pointsTotal: 180,
    requestedAt: { day: 'd2ago', time: '20:12' },
    status: 'approved',
    handledBy: 'Daewi',
  },
]

// 이벤트 보상 (Event payout) 청구 시드. 이벤트 참여 보상 지급 청구.
export type DemoEventPayout = {
  id: string
  eventName: string
  eventTime: DemoTimeLabel
  participantCount: number
  pointsPerMember: number
  totalPoints: number
  requestedAt: DemoTimeLabel
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_EVENT_PAYOUTS: DemoEventPayout[] = [
  {
    id: 'ep-1',
    eventName: 'Roads 7v7 — Mercia',
    eventTime: { day: 'yesterday', time: '22:00' },
    participantCount: 7,
    pointsPerMember: 200,
    totalPoints: 1_400,
    requestedAt: { day: 'today', time: '08:14' },
    status: 'pending',
  },
  {
    id: 'ep-2',
    eventName: 'Hellgate 4v4',
    eventTime: { day: 'd2ago', time: '22:14' },
    participantCount: 4,
    pointsPerMember: 150,
    totalPoints: 600,
    requestedAt: { day: 'yesterday', time: '09:00' },
    status: 'approved',
    handledBy: 'Eternia',
  },
]

// 청부 제작 (Craft order) 청구 시드. 크래프터가 발주받은 장비를 납품해 승인 받는 건.
export type DemoCraftOrder = {
  id: string
  crafter: string
  recipient: string
  itemLabel: string
  itemEnchant: number
  quantity: number
  silverPaid: number
  pointsCredited: number
  submittedAt: DemoTimeLabel
  status: DemoApprovalCommonStatus
  handledBy?: string
}

export const DEMO_CRAFT_ORDERS: DemoCraftOrder[] = [
  {
    id: 'co-1',
    crafter: 'Daewi',
    recipient: 'Eternia',
    itemLabel: 'Heavy Mace',
    itemEnchant: 3,
    quantity: 3,
    silverPaid: 180_000,
    pointsCredited: 240,
    submittedAt: { day: 'today', time: '14:02' },
    status: 'pending',
  },
  {
    id: 'co-2',
    crafter: 'MoonRabbit',
    recipient: 'Mochi',
    itemLabel: 'Holy Staff',
    itemEnchant: 3,
    quantity: 2,
    silverPaid: 120_000,
    pointsCredited: 160,
    submittedAt: { day: 'yesterday', time: '19:45' },
    status: 'approved',
    handledBy: 'Eternia',
  },
]

// 어드민 사이드바 배지 카운트. 데모는 pending 만 합산.
export const DEMO_ADMIN_BADGES = {
  regear: DEMO_REGEAR_LIST.filter((r) => r.status === 'pending').length,
  exchange: DEMO_EXCHANGE_REQUESTS.filter((r) => r.status === 'pending').length,
  donation: DEMO_DONATION_REQUESTS.filter((r) => r.status === 'pending').length,
  shop: DEMO_SHOP_ORDERS.filter((o) => o.status === 'pending').length,
  eventPayout: DEMO_EVENT_PAYOUTS.filter((e) => e.status === 'pending').length,
  craft: DEMO_CRAFT_ORDERS.filter((c) => c.status === 'pending').length,
}

// ─────────────────────────────────────────────────────────────────
// Dashboard summary
// ─────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────
// Stats — Top holders / FinanceFlow / Verification / Event participation /
//          Shop+Regear / Withdrawn members
// ─────────────────────────────────────────────────────────────────

export type DemoTopHolder = {
  ign: string
  discordId: string
  balance: number
  isAdmin: boolean
}

// 포인트 보유 상위 (Top Holders) — DEMO_MEMBERS 의 points 내림차순.
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

// ─────────────────────────────────────────────────────────────────
// Member detail (recent kills/deaths sample for active member)
// ─────────────────────────────────────────────────────────────────

export type DemoKillEvent = {
  id: string
  type: 'kill' | 'death'
  opponentName: string
  opponentGuild: string
  weapon: string
  zone: string
  time: DemoTimeLabel
}

export const DEMO_MEMBER_RECENT_EVENTS: Record<string, DemoKillEvent[]> = {
  Eternia: [
    {
      id: 'k-1',
      type: 'kill',
      opponentName: 'Stormbringer',
      opponentGuild: 'Wraith',
      weapon: 'Heavy Mace',
      zone: 'Mercia',
      time: { day: 'yesterday', time: '22:14' },
    },
    {
      id: 'k-2',
      type: 'kill',
      opponentName: 'IceWraith',
      opponentGuild: 'Frostbite',
      weapon: 'Heavy Mace',
      zone: 'Caerleon',
      time: { day: 'd2ago', time: '22:33' },
    },
    {
      id: 'd-1',
      type: 'death',
      opponentName: 'Stormbringer',
      opponentGuild: 'Wraith',
      weapon: 'Bedrock Mace',
      zone: 'Hellgate',
      time: { day: 'yesterday', time: '21:48' },
    },
    {
      id: 'k-3',
      type: 'kill',
      opponentName: 'DuskWalker',
      opponentGuild: 'Wraith',
      weapon: 'Heavy Mace',
      zone: 'Mercia',
      time: { day: 'd3ago', time: '22:18' },
    },
    {
      id: 'k-4',
      type: 'kill',
      opponentName: 'Marauder',
      opponentGuild: 'Steel Talon',
      weapon: 'Heavy Mace',
      zone: 'Roads',
      time: { day: 'd4ago', time: '21:05' },
    },
  ],
}
