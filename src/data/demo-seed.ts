// 데모 페이지 (`/demo/*`) 의 인라인 시드 데이터.
// 4 라우트 (dashboard, events, regear, members) 를 read-only 로 채운다.
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
// Events
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

// ─────────────────────────────────────────────────────────────────
// Regear
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
