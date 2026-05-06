// 데모 페이지 (`/demo`) 의 인라인 시드 데이터.
// v1 은 멘헤라스러운 더미 — 실데이터 wiring 은 v2 에서 별도 작업.

export type DemoSlot = {
  id: string
  role: string
  buildLabel: string
  weapon: string
  flat: number
  assigned?: string
  isCaller?: boolean
}

export type DemoEvent = {
  id: string
  name: string
  scheduledLabel: string
  templateLabel: string
  slots: DemoSlot[]
}

export type DemoTemplate = {
  id: string
  name: string
  buildOutline: string
  slots: Array<Omit<DemoSlot, 'assigned' | 'id'>>
}

export type DemoRegearPiece = {
  slot: 'head' | 'armor' | 'shoes' | 'weapon' | 'offhand' | 'cape'
  itemLabel: string
  estimatedSilver: number
}

export type DemoAutoRegearDeath = {
  id: string
  victim: string
  battleLabel: string
  diedAt: string
  killer: string
  pieces: DemoRegearPiece[]
}

export type DemoCraftMaterial = {
  resource: 'cloth' | 'leather' | 'metalbar' | 'planks'
  tier: number
  quantity: number
}

export type DemoCraftPiece = {
  itemLabel: string
  count: number
  materials: DemoCraftMaterial[]
}

export type DemoCity = 'bridgewatch' | 'caerleon' | 'brecilien' | 'lymhurst' | 'martlock'

export type DemoStatsRow = {
  ign: string
  role: string
  kills: number
  deaths: number
  battles: number
  survivalPct: number
  primaryWeapon: 'mace' | 'fire' | 'lifestaff' | 'dagger' | 'crossbow'
}

export type DemoMember = {
  ign: string
  role: '관리자' | '콜러' | '정회원' | '인턴'
  points: number
  joinedDaysAgo: number
  lastEventLabel: string
  recentRegears: number
  weeklyAttendance: string
  achievements: string[]
}

// ─────────────────────────────────────────────────────────────────
// 1. 이벤트 편집 시드
// ─────────────────────────────────────────────────────────────────

export const DEMO_TEMPLATES: DemoTemplate[] = [
  {
    id: 'tmpl-roads-7v7',
    name: 'Roads 7v7 — 표준',
    buildOutline: '탱 1 / 힐 1 / 서폿 1 / 딜 4',
    slots: [
      { role: '콜러', buildLabel: 'Heavy Mace · 8F', weapon: 'Heavy Mace', flat: 8, isCaller: true },
      { role: '탱커', buildLabel: 'Heavy Mace · 8F', weapon: 'Heavy Mace', flat: 8 },
      { role: '힐러', buildLabel: 'Holy Staff · 8F', weapon: 'Holy Staff', flat: 8 },
      { role: '서폿', buildLabel: 'Locus · 7F', weapon: 'Locus', flat: 7 },
      { role: '딜러', buildLabel: 'Dagger Pair · 8F', weapon: 'Dagger Pair', flat: 8 },
      { role: '딜러', buildLabel: 'Fire Staff · 8F', weapon: 'Great Fire Staff', flat: 8 },
      { role: '딜러', buildLabel: 'Crossbow · 8F', weapon: 'Heavy Crossbow', flat: 8 },
    ],
  },
  {
    id: 'tmpl-blackzone-zvz',
    name: 'Blackzone ZvZ — 20인',
    buildOutline: '탱 3 / 힐 4 / 서폿 3 / 딜 10',
    slots: [
      { role: '콜러', buildLabel: 'Realmbreaker · 8F', weapon: 'Realmbreaker', flat: 8, isCaller: true },
      { role: '탱커', buildLabel: 'Mace Pair · 8F', weapon: 'Camlann Mace', flat: 8 },
      { role: '탱커', buildLabel: 'Mace Pair · 8F', weapon: 'Camlann Mace', flat: 8 },
      { role: '힐러', buildLabel: 'Great Holy · 8F', weapon: 'Great Holy Staff', flat: 8 },
      { role: '힐러', buildLabel: 'Great Holy · 8F', weapon: 'Great Holy Staff', flat: 8 },
      { role: '서폿', buildLabel: 'Locus · 7F', weapon: 'Locus', flat: 7 },
      { role: '딜러', buildLabel: 'Permafrost Prism · 8F', weapon: 'Permafrost Prism', flat: 8 },
      { role: '딜러', buildLabel: 'Permafrost Prism · 8F', weapon: 'Permafrost Prism', flat: 8 },
    ],
  },
]

export const DEMO_INITIAL_EVENT: DemoEvent = {
  id: 'demo-evt-001',
  name: 'Roads 7v7 — Mercia 오레',
  scheduledLabel: '오늘 22:00 KST',
  templateLabel: 'Roads 7v7 — 표준',
  slots: [
    {
      id: 'slot-1',
      role: '콜러',
      buildLabel: 'Heavy Mace · 8F',
      weapon: 'Heavy Mace',
      flat: 8,
      assigned: 'Daewi',
      isCaller: true,
    },
    {
      id: 'slot-2',
      role: '탱커',
      buildLabel: 'Heavy Mace · 8F',
      weapon: 'Heavy Mace',
      flat: 8,
      assigned: 'Eternia',
    },
    {
      id: 'slot-3',
      role: '힐러',
      buildLabel: 'Holy Staff · 8F',
      weapon: 'Holy Staff',
      flat: 8,
      assigned: 'MoonRabbit',
    },
    {
      id: 'slot-4',
      role: '서폿',
      buildLabel: 'Locus · 7F',
      weapon: 'Locus',
      flat: 7,
      assigned: 'Mochi',
    },
    {
      id: 'slot-5',
      role: '딜러',
      buildLabel: 'Dagger Pair · 8F',
      weapon: 'Dagger Pair',
      flat: 8,
      assigned: 'ShadowAce',
    },
    {
      id: 'slot-6',
      role: '딜러',
      buildLabel: 'Fire Staff · 8F',
      weapon: 'Great Fire Staff',
      flat: 8,
    },
    {
      id: 'slot-7',
      role: '딜러',
      buildLabel: 'Crossbow · 8F',
      weapon: 'Heavy Crossbow',
      flat: 8,
    },
  ],
}

// ─────────────────────────────────────────────────────────────────
// 2. 자동 리기어 시드
// ─────────────────────────────────────────────────────────────────

export const DEMO_AUTO_REGEAR_DEATHS: DemoAutoRegearDeath[] = [
  {
    id: 'death-1',
    victim: 'Eternia',
    battleLabel: 'Black Zone — Hellgate 4v4',
    diedAt: '어제 21:48',
    killer: 'Stormbringer (Bedrock Mace)',
    pieces: [
      { slot: 'head', itemLabel: 'Specter Hood (8.1)', estimatedSilver: 128_000 },
      { slot: 'armor', itemLabel: 'Knight Armor (8.0)', estimatedSilver: 94_000 },
      { slot: 'shoes', itemLabel: 'Heretic Boots (8.0)', estimatedSilver: 76_000 },
      { slot: 'weapon', itemLabel: 'Heavy Mace (8.1)', estimatedSilver: 210_000 },
      { slot: 'cape', itemLabel: 'Lymhurst Cape (8.0)', estimatedSilver: 64_000 },
    ],
  },
  {
    id: 'death-2',
    victim: 'MoonRabbit',
    battleLabel: 'Black Zone — Mercia',
    diedAt: '오늘 12:08',
    killer: 'Frostfang (Permafrost Prism)',
    pieces: [
      { slot: 'head', itemLabel: 'Cleric Cowl (8.0)', estimatedSilver: 88_000 },
      { slot: 'armor', itemLabel: 'Cleric Robe (8.0)', estimatedSilver: 102_000 },
      { slot: 'shoes', itemLabel: 'Cleric Sandals (8.0)', estimatedSilver: 64_000 },
      { slot: 'weapon', itemLabel: 'Holy Staff (8.0)', estimatedSilver: 188_000 },
      { slot: 'cape', itemLabel: 'Caerleon Cape (8.0)', estimatedSilver: 70_000 },
    ],
  },
  {
    id: 'death-3',
    victim: 'ShadowAce',
    battleLabel: 'Black Zone — Mercia',
    diedAt: '오늘 12:09',
    killer: 'DuskWalker (Dagger Pair)',
    pieces: [
      { slot: 'head', itemLabel: 'Hunter Hood (8.0)', estimatedSilver: 72_000 },
      { slot: 'armor', itemLabel: 'Mercenary Jacket (8.0)', estimatedSilver: 84_000 },
      { slot: 'shoes', itemLabel: 'Mercenary Shoes (8.0)', estimatedSilver: 58_000 },
      { slot: 'weapon', itemLabel: 'Dagger Pair (8.0)', estimatedSilver: 156_000 },
      { slot: 'cape', itemLabel: 'Bridgewatch Cape (8.0)', estimatedSilver: 60_000 },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────
// 3. 제작 리기어 시드 (7일 누적 BoM)
// ─────────────────────────────────────────────────────────────────

export const DEMO_CRAFT_PIECES: DemoCraftPiece[] = [
  {
    itemLabel: 'Heavy Mace (8.1)',
    count: 4,
    materials: [
      { resource: 'metalbar', tier: 8, quantity: 32 },
      { resource: 'planks', tier: 8, quantity: 16 },
    ],
  },
  {
    itemLabel: 'Knight Armor (8.0)',
    count: 6,
    materials: [
      { resource: 'metalbar', tier: 8, quantity: 48 },
      { resource: 'leather', tier: 8, quantity: 24 },
    ],
  },
  {
    itemLabel: 'Specter Hood (8.1)',
    count: 5,
    materials: [
      { resource: 'cloth', tier: 8, quantity: 30 },
      { resource: 'leather', tier: 8, quantity: 10 },
    ],
  },
  {
    itemLabel: 'Holy Staff (8.0)',
    count: 3,
    materials: [
      { resource: 'planks', tier: 8, quantity: 36 },
    ],
  },
  {
    itemLabel: 'Heretic Boots (8.0)',
    count: 7,
    materials: [
      { resource: 'leather', tier: 8, quantity: 35 },
      { resource: 'cloth', tier: 8, quantity: 14 },
    ],
  },
]

// 도시별 반환율 (Albion 인게임 기준 비슷하게)
export const DEMO_CITY_RETURN_RATES: Record<DemoCity, number> = {
  bridgewatch: 53.9,
  caerleon: 24.8,
  brecilien: 49.4,
  lymhurst: 53.9,
  martlock: 53.9,
}

export const DEMO_CITY_LABELS: Record<DemoCity, string> = {
  bridgewatch: 'Bridgewatch',
  caerleon: 'Caerleon',
  brecilien: 'Brecilien',
  lymhurst: 'Lymhurst',
  martlock: 'Martlock',
}

// 도시별 자원 시세 (실버, 더미 — 실제로는 AODP)
export const DEMO_RESOURCE_PRICES: Record<DemoCity, Record<DemoCraftMaterial['resource'], number>> = {
  bridgewatch: { metalbar: 4_200, planks: 3_800, cloth: 3_100, leather: 3_400 },
  caerleon: { metalbar: 4_500, planks: 4_000, cloth: 3_300, leather: 3_600 },
  brecilien: { metalbar: 4_350, planks: 3_900, cloth: 3_200, leather: 3_500 },
  lymhurst: { metalbar: 4_150, planks: 3_750, cloth: 3_050, leather: 3_350 },
  martlock: { metalbar: 4_180, planks: 3_780, cloth: 3_080, leather: 3_380 },
}

// ─────────────────────────────────────────────────────────────────
// 4. 통계 시드
// ─────────────────────────────────────────────────────────────────

export const DEMO_STATS_ROWS: DemoStatsRow[] = [
  { ign: 'Eternia', role: '탱커', kills: 142, deaths: 32, battles: 174, survivalPct: 81, primaryWeapon: 'mace' },
  { ign: 'Daewi', role: '콜러', kills: 88, deaths: 18, battles: 106, survivalPct: 83, primaryWeapon: 'mace' },
  { ign: 'MoonRabbit', role: '힐러', kills: 24, deaths: 22, battles: 168, survivalPct: 87, primaryWeapon: 'lifestaff' },
  { ign: 'Mochi', role: '서폿', kills: 12, deaths: 14, battles: 102, survivalPct: 86, primaryWeapon: 'lifestaff' },
  { ign: 'ShadowAce', role: '딜러', kills: 188, deaths: 41, battles: 152, survivalPct: 73, primaryWeapon: 'dagger' },
  { ign: 'Frostpine', role: '딜러', kills: 122, deaths: 38, battles: 126, survivalPct: 70, primaryWeapon: 'fire' },
  { ign: 'Lumina', role: '힐러', kills: 18, deaths: 12, battles: 88, survivalPct: 86, primaryWeapon: 'lifestaff' },
  { ign: 'Vexa', role: '딜러', kills: 96, deaths: 22, battles: 84, survivalPct: 74, primaryWeapon: 'crossbow' },
  { ign: 'Borin', role: '탱커', kills: 64, deaths: 18, battles: 78, survivalPct: 77, primaryWeapon: 'mace' },
  { ign: 'NebulaQ', role: '딜러', kills: 142, deaths: 26, battles: 92, survivalPct: 72, primaryWeapon: 'fire' },
]

// ─────────────────────────────────────────────────────────────────
// 5. 길드원 시드
// ─────────────────────────────────────────────────────────────────

export const DEMO_MEMBERS: DemoMember[] = [
  {
    ign: 'Eternia',
    role: '관리자',
    points: 4_280,
    joinedDaysAgo: 412,
    lastEventLabel: '오늘 22:00 Roads 7v7',
    recentRegears: 3,
    weeklyAttendance: '6 / 7',
    achievements: ['철벽 탱커', '100전 돌파', '이달의 MVP'],
  },
  {
    ign: 'Daewi',
    role: '콜러',
    points: 3_980,
    joinedDaysAgo: 384,
    lastEventLabel: '오늘 22:00 Roads 7v7',
    recentRegears: 2,
    weeklyAttendance: '7 / 7',
    achievements: ['콜러 100승', '무패 5연승'],
  },
  {
    ign: 'MoonRabbit',
    role: '정회원',
    points: 2_640,
    joinedDaysAgo: 268,
    lastEventLabel: '어제 22:14 Hellgate 4v4',
    recentRegears: 1,
    weeklyAttendance: '5 / 7',
    achievements: ['생명의 빛', '50전 돌파'],
  },
  {
    ign: 'Mochi',
    role: '정회원',
    points: 2_120,
    joinedDaysAgo: 224,
    lastEventLabel: '오늘 22:00 Roads 7v7',
    recentRegears: 1,
    weeklyAttendance: '4 / 7',
    achievements: ['서폿의 정석'],
  },
  {
    ign: 'ShadowAce',
    role: '정회원',
    points: 3_560,
    joinedDaysAgo: 198,
    lastEventLabel: '오늘 22:00 Roads 7v7',
    recentRegears: 4,
    weeklyAttendance: '6 / 7',
    achievements: ['단검의 그림자', '100킬 돌파'],
  },
  {
    ign: 'Frostpine',
    role: '정회원',
    points: 1_840,
    joinedDaysAgo: 162,
    lastEventLabel: '어제 21:48 Hellgate 4v4',
    recentRegears: 2,
    weeklyAttendance: '5 / 7',
    achievements: ['화염의 길'],
  },
  {
    ign: 'Lumina',
    role: '정회원',
    points: 1_220,
    joinedDaysAgo: 88,
    lastEventLabel: '어제 22:14 Hellgate 4v4',
    recentRegears: 0,
    weeklyAttendance: '3 / 7',
    achievements: [],
  },
  {
    ign: 'Vexa',
    role: '정회원',
    points: 2_080,
    joinedDaysAgo: 142,
    lastEventLabel: '오늘 22:00 Roads 7v7',
    recentRegears: 1,
    weeklyAttendance: '4 / 7',
    achievements: ['저격수의 눈'],
  },
  {
    ign: 'Borin',
    role: '인턴',
    points: 480,
    joinedDaysAgo: 22,
    lastEventLabel: '어제 22:14 Hellgate 4v4',
    recentRegears: 1,
    weeklyAttendance: '4 / 7',
    achievements: ['첫 출정'],
  },
  {
    ign: 'NebulaQ',
    role: '정회원',
    points: 2_520,
    joinedDaysAgo: 168,
    lastEventLabel: '어제 21:48 Hellgate 4v4',
    recentRegears: 2,
    weeklyAttendance: '5 / 7',
    achievements: ['화염의 길'],
  },
]
