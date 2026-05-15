// 데모 멤버 상세의 최근 킬/데스 샘플.
// /demo/members/[ign] 에서 활성 멤버 (Eternia) 의 최근 전투 타임라인으로 사용.

import type { DemoTimeLabel } from './shared'

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
