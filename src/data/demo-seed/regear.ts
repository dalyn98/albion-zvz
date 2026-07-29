// 데모 리기어 시드 — /demo/regear, /demo/regear/[id] 에서 사용.

import type { DemoTimeLabel } from './shared'

export type DemoRegearStatus = 'pending' | 'approved' | 'rejected'
export type DemoRegearOrigin = 'event' | 'free_window' | 'auto'
export type DemoRegearType = 'death' | 'overcharge'
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
  requestType?: DemoRegearType
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
    origin: 'event',
    totalSilver: 318_000,
    capSilver: 380_000,
  },
  {
    id: 'rg-8',
    victim: 'Eternia',
    battleLabel: 'Black Zone — Mercia',
    diedAt: { day: 'today', time: '12:16' },
    killerName: 'Overcharge',
    killerWeapon: 'Guild call',
    status: 'pending',
    origin: 'event',
    requestType: 'overcharge',
    totalSilver: 148_000,
    capSilver: 600_000,
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
    origin: 'free_window',
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

const DEMO_REGEAR_DETAIL_PIECES: Record<string, DemoRegearPiece[]> = {
  'rg-1': [
    { slot: 'head', itemLabel: 'Specter Hood (8.1)', estimatedSilver: 128_000 },
    { slot: 'armor', itemLabel: 'Knight Armor (8.0)', estimatedSilver: 94_000 },
    { slot: 'shoes', itemLabel: 'Heretic Boots (8.0)', estimatedSilver: 76_000 },
    { slot: 'weapon', itemLabel: 'Heavy Mace (8.1)', estimatedSilver: 210_000 },
    { slot: 'cape', itemLabel: 'Lymhurst Cape (8.0)', estimatedSilver: 64_000 },
  ],
}

export const DEMO_REGEAR_DETAILS: DemoRegearDetail[] = DEMO_REGEAR_LIST.map((request) => ({
  ...request,
  pieces: DEMO_REGEAR_DETAIL_PIECES[request.id] ?? [],
}))

export const DEMO_REGEAR_DETAIL: DemoRegearDetail = DEMO_REGEAR_DETAILS[0]!
