// 데모 길드원 시드 — /demo/members, /demo/members/[ign], 사이드바 카운트 등에서 사용.

export type DemoMemberRoleKey = 'admin' | 'caller' | 'member' | 'intern'

export type DemoWeaponKey = 'mace' | 'fire' | 'lifestaff' | 'dagger' | 'crossbow'

export type DemoAchievementKey =
  | 'teamVictory'
  | 'teamLargeBattle'
  | 'teamOutnumberedVictory'
  | 'participation50'
  | 'participation100'
  | 'kill50'
  | 'kill200'
  | 'deathless5'

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
  wins: number
  losses: number
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
    achievements: ['teamVictory', 'teamLargeBattle', 'participation100'],
    kills: 142,
    deaths: 32,
    battles: 174,
    wins: 96,
    losses: 61,
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
    achievements: ['teamVictory', 'teamOutnumberedVictory', 'deathless5'],
    kills: 88,
    deaths: 18,
    battles: 106,
    wins: 68,
    losses: 31,
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
    achievements: ['teamVictory', 'participation100'],
    kills: 24,
    deaths: 22,
    battles: 168,
    wins: 88,
    losses: 63,
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
    achievements: ['participation50'],
    kills: 12,
    deaths: 14,
    battles: 102,
    wins: 52,
    losses: 42,
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
    achievements: ['teamVictory', 'kill200'],
    kills: 188,
    deaths: 41,
    battles: 152,
    wins: 83,
    losses: 58,
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
    achievements: ['kill50'],
    kills: 122,
    deaths: 38,
    battles: 126,
    wins: 65,
    losses: 50,
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
    wins: 45,
    losses: 35,
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
    achievements: ['kill50'],
    kills: 96,
    deaths: 22,
    battles: 84,
    wins: 47,
    losses: 30,
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
    achievements: ['participation50'],
    kills: 64,
    deaths: 18,
    battles: 78,
    wins: 39,
    losses: 33,
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
    achievements: ['teamLargeBattle', 'kill50'],
    kills: 142,
    deaths: 26,
    battles: 92,
    wins: 54,
    losses: 31,
    survivalPct: 72,
  },
]
