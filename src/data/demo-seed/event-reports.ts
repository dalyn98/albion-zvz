import type { SlotRole } from '@/types'

export type DemoReportOutcome = 'win' | 'loss' | 'undecided'

export interface DemoEventReportBattle {
  battleNumber: number
  opponentGuild: string
  outcome: DemoReportOutcome
}

export interface DemoEventReportLeader {
  key: string
  username: string
  kills: number
  deaths: number
}

export interface DemoEventReportParticipant {
  key: string
  username: string
  role: SlotRole | null
  status: 'confirmed_assigned' | 'assigned_no_battle' | 'unassigned_battle'
  battleCount: number
  kills: number
  deaths: number
}

export interface DemoEventReport {
  eventId: string
  outcome: DemoReportOutcome
  battles: DemoEventReportBattle[]
  participation: {
    uniqueAssigned: number
    assignedSlots: number
    totalSlots: number
    roleBreakdown: Array<{ role: SlotRole; count: number }>
  }
  attendance: {
    confirmedAssigned: number
    eventAttendanceRate: number | null
    unconfirmedAssigned: number
    unassignedBattleParticipants: number
    linkedBattleCount: number
    battleParticipations: number
    battleParticipants: number
    participants: DemoEventReportParticipant[]
  }
  combat: {
    totalKills: number
    totalDeaths: number
    kdRatio: number | null
    topKillers: DemoEventReportLeader[]
  }
  survival: {
    attended: number
    survived: number
    died: number
    rate: number | null
  }
  regear: {
    totalClaims: number
    totalPayoutSilver: number
    approvedCount: number
    pendingCount: number
    rejectedCount: number
  }
}

export const DEMO_EVENT_REPORTS: readonly DemoEventReport[] = [
  {
    eventId: 'evt-4',
    outcome: 'win',
    battles: [
      { battleNumber: 1, opponentGuild: 'Roadwatch', outcome: 'win' },
      { battleNumber: 2, opponentGuild: 'Ore Pact', outcome: 'win' },
    ],
    participation: {
      uniqueAssigned: 7,
      assignedSlots: 7,
      totalSlots: 7,
      roleBreakdown: [
        { role: 'Caller', count: 1 },
        { role: 'DefTanker', count: 2 },
        { role: 'Healer', count: 1 },
        { role: 'Sup', count: 1 },
        { role: 'EngageDps', count: 2 },
      ],
    },
    attendance: {
      confirmedAssigned: 6,
      eventAttendanceRate: 6 / 7,
      unconfirmedAssigned: 1,
      unassignedBattleParticipants: 1,
      linkedBattleCount: 2,
      battleParticipations: 12,
      battleParticipants: 7,
      participants: [
        {
          key: 'Daewi',
          username: 'Daewi',
          role: 'Caller',
          status: 'confirmed_assigned',
          battleCount: 2,
          kills: 4,
          deaths: 0,
        },
        {
          key: 'Eternia',
          username: 'Eternia',
          role: 'DefTanker',
          status: 'confirmed_assigned',
          battleCount: 2,
          kills: 1,
          deaths: 1,
        },
        {
          key: 'MoonRabbit',
          username: 'MoonRabbit',
          role: 'Healer',
          status: 'confirmed_assigned',
          battleCount: 2,
          kills: 0,
          deaths: 0,
        },
        {
          key: 'Mochi',
          username: 'Mochi',
          role: 'Sup',
          status: 'confirmed_assigned',
          battleCount: 2,
          kills: 1,
          deaths: 0,
        },
        {
          key: 'ShadowAce',
          username: 'ShadowAce',
          role: 'EngageDps',
          status: 'confirmed_assigned',
          battleCount: 2,
          kills: 6,
          deaths: 1,
        },
        {
          key: 'Frostpine',
          username: 'Frostpine',
          role: 'EngageDps',
          status: 'confirmed_assigned',
          battleCount: 1,
          kills: 2,
          deaths: 0,
        },
        {
          key: 'Lumina',
          username: 'Lumina',
          role: null,
          status: 'unassigned_battle',
          battleCount: 1,
          kills: 1,
          deaths: 0,
        },
      ],
    },
    combat: {
      totalKills: 15,
      totalDeaths: 2,
      kdRatio: 7.5,
      topKillers: [
        { key: 'ShadowAce', username: 'ShadowAce', kills: 6, deaths: 1 },
        { key: 'Daewi', username: 'Daewi', kills: 4, deaths: 0 },
        { key: 'Frostpine', username: 'Frostpine', kills: 2, deaths: 0 },
      ],
    },
    survival: {
      attended: 7,
      survived: 5,
      died: 2,
      rate: 5 / 7,
    },
    regear: {
      totalClaims: 2,
      totalPayoutSilver: 1_840_000,
      approvedCount: 1,
      pendingCount: 1,
      rejectedCount: 0,
    },
  },
  {
    eventId: 'evt-5',
    outcome: 'loss',
    battles: [{ battleNumber: 1, opponentGuild: 'Night Bell', outcome: 'loss' }],
    participation: {
      uniqueAssigned: 4,
      assignedSlots: 4,
      totalSlots: 4,
      roleBreakdown: [
        { role: 'DefTanker', count: 1 },
        { role: 'Healer', count: 1 },
        { role: 'Sup', count: 1 },
        { role: 'EngageDps', count: 1 },
      ],
    },
    attendance: {
      confirmedAssigned: 3,
      eventAttendanceRate: 3 / 4,
      unconfirmedAssigned: 1,
      unassignedBattleParticipants: 0,
      linkedBattleCount: 1,
      battleParticipations: 3,
      battleParticipants: 3,
      participants: [
        {
          key: 'Eternia',
          username: 'Eternia',
          role: 'DefTanker',
          status: 'confirmed_assigned',
          battleCount: 1,
          kills: 0,
          deaths: 1,
        },
        {
          key: 'MoonRabbit',
          username: 'MoonRabbit',
          role: 'Healer',
          status: 'confirmed_assigned',
          battleCount: 1,
          kills: 0,
          deaths: 0,
        },
        {
          key: 'ShadowAce',
          username: 'ShadowAce',
          role: 'EngageDps',
          status: 'confirmed_assigned',
          battleCount: 1,
          kills: 2,
          deaths: 1,
        },
      ],
    },
    combat: {
      totalKills: 2,
      totalDeaths: 2,
      kdRatio: 1,
      topKillers: [
        { key: 'ShadowAce', username: 'ShadowAce', kills: 2, deaths: 1 },
      ],
    },
    survival: {
      attended: 3,
      survived: 1,
      died: 2,
      rate: 1 / 3,
    },
    regear: {
      totalClaims: 1,
      totalPayoutSilver: 640_000,
      approvedCount: 0,
      pendingCount: 1,
      rejectedCount: 0,
    },
  },
]

export function getDemoEventReport(eventId: string): DemoEventReport | null {
  return DEMO_EVENT_REPORTS.find((report) => report.eventId === eventId) ?? null
}
