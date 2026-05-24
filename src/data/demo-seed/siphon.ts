// 데모 사이펀 시드 — 관리자 사이펀 입출금 관리와 멤버 내 사이펀 화면에서 사용.
// 실제 데이터는 인게임 사이펀 입출금 로그 기반이지만, 데모에서는 결정적 상수로만
// 구성해 새로고침해도 항상 같은 체험을 제공한다.

export type DemoSiphonLedgerRow = {
  id: string
  loggedAt: string
  player: string
  itemNameRaw: string
  quantity: number
  importedBy: string
}

export type DemoSiphonBalance = {
  player: string
  deposited: number
  withdrawn: number
  net: number
  lastActivityAt: string
}

export const DEMO_SIPHON_ITEM_NAME = 'Siphoned Energy'

export const DEMO_SIPHON_LEDGER: readonly DemoSiphonLedgerRow[] = [
  {
    id: 'sf-1',
    loggedAt: '2026-05-21 23:18',
    player: 'Eternia',
    itemNameRaw: DEMO_SIPHON_ITEM_NAME,
    quantity: -12,
    importedBy: 'Daewi',
  },
  {
    id: 'sf-2',
    loggedAt: '2026-05-21 22:41',
    player: 'Daewi',
    itemNameRaw: DEMO_SIPHON_ITEM_NAME,
    quantity: -8,
    importedBy: 'Eternia',
  },
  {
    id: 'sf-3',
    loggedAt: '2026-05-21 21:05',
    player: 'MoonRabbit',
    itemNameRaw: DEMO_SIPHON_ITEM_NAME,
    quantity: 40,
    importedBy: 'Eternia',
  },
  {
    id: 'sf-4',
    loggedAt: '2026-05-20 23:18',
    player: 'Eternia',
    itemNameRaw: DEMO_SIPHON_ITEM_NAME,
    quantity: 120,
    importedBy: 'Daewi',
  },
  {
    id: 'sf-5',
    loggedAt: '2026-05-20 22:52',
    player: 'Mochi',
    itemNameRaw: DEMO_SIPHON_ITEM_NAME,
    quantity: -16,
    importedBy: 'Eternia',
  },
  {
    id: 'sf-6',
    loggedAt: '2026-05-19 21:14',
    player: 'Vexa',
    itemNameRaw: DEMO_SIPHON_ITEM_NAME,
    quantity: 55,
    importedBy: 'Daewi',
  },
  {
    id: 'sf-7',
    loggedAt: '2026-05-19 20:43',
    player: 'Borin',
    itemNameRaw: DEMO_SIPHON_ITEM_NAME,
    quantity: -5,
    importedBy: 'Eternia',
  },
  {
    id: 'sf-8',
    loggedAt: '2026-05-18 23:02',
    player: 'Daewi',
    itemNameRaw: DEMO_SIPHON_ITEM_NAME,
    quantity: 75,
    importedBy: 'Eternia',
  },
] as const

export const DEMO_SIPHON_BALANCES: readonly DemoSiphonBalance[] = [
  {
    player: 'Eternia',
    deposited: 120,
    withdrawn: 12,
    net: 108,
    lastActivityAt: '2026-05-21 23:18',
  },
  {
    player: 'Daewi',
    deposited: 75,
    withdrawn: 8,
    net: 67,
    lastActivityAt: '2026-05-21 22:41',
  },
  {
    player: 'MoonRabbit',
    deposited: 40,
    withdrawn: 0,
    net: 40,
    lastActivityAt: '2026-05-21 21:05',
  },
  {
    player: 'Vexa',
    deposited: 55,
    withdrawn: 0,
    net: 55,
    lastActivityAt: '2026-05-19 21:14',
  },
  {
    player: 'Mochi',
    deposited: 0,
    withdrawn: 16,
    net: -16,
    lastActivityAt: '2026-05-20 22:52',
  },
  {
    player: 'Borin',
    deposited: 0,
    withdrawn: 5,
    net: -5,
    lastActivityAt: '2026-05-19 20:43',
  },
] as const

export const DEMO_SIPHON_IMPORT_SAMPLE = `"날짜"\t"플레이어"\t"목적"\t"수량"
"2026-05-21 23:18:12"\t"Eternia"\t"출금"\t"-12"
"2026-05-21 22:41:33"\t"Daewi"\t"출금"\t"-8"
"2026-05-21 21:05:02"\t"MoonRabbit"\t"입금"\t"40"`
