// 데모 이벤트 시드 — /demo/events, /demo/events/[id], home 카드, 사이드바 등에서 사용.

import type { DemoTimeLabel } from './shared'

export type DemoSlotRoleKey = 'caller' | 'tank' | 'healer' | 'support' | 'engageDps'

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
  weaponOptions?: string[]
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
          role: 'engageDps',
          buildLabel: 'Dagger Pair · 8F',
          weapon: 'Dagger Pair',
          flat: 8,
          assigned: 'ShadowAce',
        },
        {
          role: 'engageDps',
          buildLabel: 'Brimstone Staff · 8F',
          weapon: 'Brimstone Staff',
          flat: 8,
        },
        {
          role: 'engageDps',
          buildLabel: 'Crossbow · 8F',
          weapon: 'Heavy Crossbow',
          weaponOptions: ['Heavy Crossbow', 'Brimstone Staff', 'Dagger Pair'],
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
