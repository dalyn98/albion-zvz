// 데모 길드원 시드 — /demo/members, /demo/members/[ign], 사이드바 카운트 등에서 사용.

export type DemoMemberRoleKey = 'admin' | 'caller' | 'member' | 'intern'

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
