import { describe, expect, it, vi } from 'vitest'
import {
  fetchMemberBattleParticipations,
  fetchMemberBattleParticipationsForMember,
  fetchTrackedBattleWindows,
  findTrackedBattleKey,
  groupMemberKillsByBattle,
  isWithinTrackedWindow,
  mergeMemberBattles,
  type BattleParticipationRow,
  type MemberBattleOutcome,
  type TrackedBattleWindow,
  type TrackedBattles,
} from './tracked-kills'

// 도메인 invariant 화석화: 킬로그 → "참여 배틀" 변환의 핵심 규칙.
// - battle_id 정확 매칭이 우선, NULL 이면 시간창 폴백 (legacy 마이그 096 이전).
// - 시간창 밖/매칭 안되는 kill 은 무시 (1:1 갱킹·다른 전투 이벤트).
// - groupMemberKillsByBattle: role='killer'/'victim' 분리 합산.
// - mergeMemberBattles: 0k0d 참여자도 windows 의 outcome 으로 잡아냄.

function makeWindow(overrides: Partial<TrackedBattleWindow> = {}): TrackedBattleWindow {
  const startedAtMs = overrides.startedAtMs ?? Date.parse('2026-01-01T10:00:00.000Z')
  return {
    startedAtMs,
    endedAtMs: overrides.endedAtMs ?? startedAtMs + 30 * 60 * 1000,
    rawStartedAt: overrides.rawStartedAt ?? new Date(startedAtMs).toISOString(),
    outcome: overrides.outcome ?? 'win',
    albionBattleId: overrides.albionBattleId ?? null,
  }
}

function makeTracked(windows: TrackedBattleWindow[]): TrackedBattles {
  const byBattleId = new Map<number, TrackedBattleWindow>()
  for (const w of windows) {
    if (w.albionBattleId !== null) byBattleId.set(w.albionBattleId, w)
  }
  return { windows: [...windows].sort((a, b) => a.startedAtMs - b.startedAtMs), byBattleId }
}

describe('isWithinTrackedWindow — battle_id 우선, 시간창 폴백', () => {
  it('matches exactly by battle_id regardless of time', () => {
    const tracked = makeTracked([makeWindow({ albionBattleId: 42, outcome: 'win' })])
    // 시간이 창 밖이라도 battle_id 가 맞으면 매칭
    expect(isWithinTrackedWindow('2030-01-01T00:00:00.000Z', 42, tracked)).toBe(true)
  })

  it('returns false when battle_id is provided but not in tracked set', () => {
    // battle_id 가 있으면 그것만 신뢰 — 시간창 안에 있어도 다른 전투의 이벤트.
    const win = makeWindow({ albionBattleId: 42 })
    const tracked = makeTracked([win])
    const insideTime = new Date(win.startedAtMs + 1000).toISOString()
    expect(isWithinTrackedWindow(insideTime, 999, tracked)).toBe(false)
  })

  it('falls back to time-window match when battle_id is null (legacy)', () => {
    const win = makeWindow({ albionBattleId: null })
    const tracked = makeTracked([win])
    const inside = new Date(win.startedAtMs + 5 * 60 * 1000).toISOString()
    expect(isWithinTrackedWindow(inside, null, tracked)).toBe(true)
  })

  it('returns false when time is outside any window and battle_id is null', () => {
    const win = makeWindow({ albionBattleId: null })
    const tracked = makeTracked([win])
    const after = new Date(win.endedAtMs + 60 * 1000).toISOString()
    expect(isWithinTrackedWindow(after, null, tracked)).toBe(false)
  })
})

describe('findTrackedBattleKey — albion:<id> 우선, time:<rawStart> 폴백', () => {
  it('returns albion:<id> when albionBattleId is set', () => {
    const tracked = makeTracked([makeWindow({ albionBattleId: 42 })])
    expect(findTrackedBattleKey(null, 42, tracked)).toBe('albion:42')
  })

  it('returns time:<rawStart> when albionBattleId is null and match is by time', () => {
    const win = makeWindow({ albionBattleId: null, rawStartedAt: '2026-01-01T10:00:00.000Z' })
    const tracked = makeTracked([win])
    const inside = new Date(win.startedAtMs + 1000).toISOString()
    expect(findTrackedBattleKey(inside, null, tracked)).toBe('time:2026-01-01T10:00:00.000Z')
  })

  it('returns null when no window matches', () => {
    const tracked = makeTracked([makeWindow({ albionBattleId: 42 })])
    // battle_id 가 다르면 매칭 안 됨
    expect(findTrackedBattleKey(null, 99, tracked)).toBeNull()
  })
})

describe('groupMemberKillsByBattle — killer/victim 분리 + battle 단위 합산', () => {
  it('aggregates kills and deaths under the same battle key with hadDeath flag', () => {
    const win = makeWindow({ albionBattleId: 7, outcome: 'win', rawStartedAt: '2026-01-01T10:00:00.000Z' })
    const tracked = makeTracked([win])
    const result = groupMemberKillsByBattle(
      [
        { role: 'killer', occurred_at: null, battle_id: 7 },
        { role: 'killer', occurred_at: null, battle_id: 7 },
        { role: 'victim', occurred_at: null, battle_id: 7 },
      ],
      tracked,
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      startedAt: '2026-01-01T10:00:00.000Z',
      outcome: 'win',
      hadDeath: true,
      killCount: 2,
      deathCount: 1,
    })
  })

  it('skips kills that do not match any tracked window (gank / non-ZvZ)', () => {
    const tracked = makeTracked([makeWindow({ albionBattleId: 7 })])
    const result = groupMemberKillsByBattle(
      [
        { role: 'killer', occurred_at: null, battle_id: 9999 }, // 미매칭
      ],
      tracked,
    )
    expect(result).toHaveLength(0)
  })
})

describe('mergeMemberBattles — 0k0d 참여자 + windows outcome 우선', () => {
  it('adds zero-K/D participations using windows outcome', () => {
    const win = makeWindow({ rawStartedAt: '2026-01-01T10:00:00.000Z', outcome: 'win' })
    const tracked = makeTracked([win])
    // killboard 기록은 없음, participation 만 있음
    const killBattles: MemberBattleOutcome[] = []
    const participations = new Map<string, string>([['2026-01-01T10:00:00.000Z', 'win']])
    const result = mergeMemberBattles(killBattles, participations, tracked)
    expect(result).toEqual([
      {
        startedAt: '2026-01-01T10:00:00.000Z',
        outcome: 'win',
        hadDeath: false,
        killCount: 0,
        deathCount: 0,
      },
    ])
  })

  it('skips participations whose startedAt is not in tracked.windows (engagement cut)', () => {
    const win = makeWindow({ rawStartedAt: '2026-01-01T10:00:00.000Z' })
    const tracked = makeTracked([win])
    // RPC 가 컷되지 않은 데이터를 돌려줘도 windows 에 없으면 skip
    const participations = new Map<string, string>([
      ['2026-01-01T11:00:00.000Z', 'loss'], // tracked windows 에 없음
    ])
    expect(mergeMemberBattles([], participations, tracked)).toEqual([])
  })

  it('keeps killboard data when both sources have the same battle (killboard wins)', () => {
    const win = makeWindow({ rawStartedAt: '2026-01-01T10:00:00.000Z', outcome: 'tie' })
    const tracked = makeTracked([win])
    const killBattles: MemberBattleOutcome[] = [
      {
        startedAt: '2026-01-01T10:00:00.000Z',
        outcome: 'win',
        hadDeath: true,
        killCount: 3,
        deathCount: 1,
      },
    ]
    const participations = new Map<string, string>([['2026-01-01T10:00:00.000Z', 'loss']])
    const result = mergeMemberBattles(killBattles, participations, tracked)
    expect(result).toHaveLength(1)
    expect(result[0].killCount).toBe(3)
    expect(result[0].deathCount).toBe(1)
  })
})

describe('fetchTrackedBattleWindows — tenant_battle_records pagination', () => {
  it('loads tracked battle rows beyond the first 1000-row PostgREST page', async () => {
    const baseMs = Date.parse('2026-01-01T00:00:00.000Z')
    const makeRow = (i: number) => ({
      started_at: new Date(baseMs + i * 60_000).toISOString(),
      outcome: 'win',
      home_kills: 1,
      home_deaths: 1,
      home_team_size: 10,
      main_opponent_team_size: 10,
      battle_records: {
        ended_at: new Date(baseMs + i * 60_000 + 10_000).toISOString(),
        albion_battle_id: i,
      },
    })
    const pages = [
      Array.from({ length: 1000 }, (_, i) => makeRow(i)),
      [makeRow(1000)],
    ]
    const rangeCalls: Array<[number, number]> = []
    const orderCalls: string[] = []
    const builder = () => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        gte: vi.fn(() => query),
        order: vi.fn((column: string) => {
          orderCalls.push(column)
          return query
        }),
        range: vi.fn(async (from: number, to: number) => {
          rangeCalls.push([from, to])
          return { data: pages[Math.floor(from / 1000)] ?? [], error: null }
        }),
      }
      return query
    }
    const db = {
      from: vi.fn(() => builder()),
    }

    const result = await fetchTrackedBattleWindows(
      db as unknown as Parameters<typeof fetchTrackedBattleWindows>[0],
      'guild-1',
    )

    expect(result.windows).toHaveLength(1001)
    expect(result.byBattleId.size).toBe(1001)
    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(orderCalls).toEqual([
      'started_at',
      'battle_record_id',
      'started_at',
      'battle_record_id',
    ])
  })
})

describe('fetchMemberBattleParticipations — RPC pagination', () => {
  it('loads participation rows beyond the first 1000-row PostgREST page', async () => {
    const firstPage = Array.from(
      { length: 1000 },
      (_, i): BattleParticipationRow => ({
        discord_id: `discord-${i}`,
        albion_player_id: `player-${i}`,
        raw_started_at: '2026-01-01T10:00:00.000Z',
        outcome: 'win',
      }),
    )
    const secondPage: BattleParticipationRow[] = [
      {
        discord_id: 'discord-1000',
        albion_player_id: 'player-1000',
        raw_started_at: '2026-01-02T10:00:00.000Z',
        outcome: 'loss',
      },
      {
        discord_id: null,
        albion_player_id: 'player-1001',
        raw_started_at: '2026-01-03T10:00:00.000Z',
        outcome: 'tie',
      },
    ]
    const pages = [firstPage, secondPage]
    const rangeCalls: Array<[number, number]> = []
    const orderCalls: Array<[string, unknown]> = []
    const rpc = vi.fn(() => {
      const builder = {
        order: vi.fn((column: string, options: unknown) => {
          orderCalls.push([column, options])
          return builder
        }),
        range: vi.fn(async (from: number, to: number) => {
          rangeCalls.push([from, to])
          return { data: pages[Math.floor(from / 1000)] ?? [], error: null }
        }),
      }
      return builder
    })

    const result = await fetchMemberBattleParticipations(
      { rpc } as unknown as Parameters<typeof fetchMemberBattleParticipations>[0],
      'guild-1',
    )

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(orderCalls.map(([column]) => column)).toEqual([
      'raw_started_at',
      'albion_player_id',
      'discord_id',
      'raw_started_at',
      'albion_player_id',
      'discord_id',
    ])
    expect(result.byAlbionPlayerId.size).toBe(1002)
    expect(result.byAlbionPlayerId.get('player-1000')?.get('2026-01-02T10:00:00.000Z')).toBe(
      'loss',
    )
    expect(result.discordByAlbionPlayerId.get('player-1001')).toBeUndefined()
  })

  it('loads only the requested member through the single-member participation RPC', async () => {
    const rangeCalls: Array<[number, number]> = []
    const rpc = vi.fn(() => {
      const builder = {
        order: vi.fn(() => builder),
        range: vi.fn(async (from: number, to: number) => {
          rangeCalls.push([from, to])
          return {
            data: [{
              discord_id: 'discord-1',
              albion_player_id: 'player-1',
              raw_started_at: '2026-01-02T10:00:00.000Z',
              outcome: 'win',
            }],
            error: null,
          }
        }),
      }
      return builder
    })

    const result = await fetchMemberBattleParticipationsForMember(
      { rpc } as unknown as Parameters<typeof fetchMemberBattleParticipationsForMember>[0],
      'guild-1',
      { albionPlayerId: 'player-1' },
    )

    expect(rpc).toHaveBeenCalledWith('member_battle_participations_for_member', {
      p_guild_id: 'guild-1',
      p_albion_player_id: 'player-1',
      p_discord_id: null,
    })
    expect(rangeCalls).toEqual([[0, 999]])
    expect(result.byAlbionPlayerId.size).toBe(1)
    expect(result.byAlbionPlayerId.get('player-1')?.get('2026-01-02T10:00:00.000Z')).toBe('win')
  })

  it('can target a linked member by discord id without loading the full guild map', async () => {
    const rpc = vi.fn(() => {
      const builder = {
        order: vi.fn(() => builder),
        range: vi.fn(async () => ({
          data: [{
            discord_id: 'discord-1',
            albion_player_id: 'player-1',
            raw_started_at: '2026-01-02T10:00:00.000Z',
            outcome: 'loss',
          }],
          error: null,
        })),
      }
      return builder
    })

    const result = await fetchMemberBattleParticipationsForMember(
      { rpc } as unknown as Parameters<typeof fetchMemberBattleParticipationsForMember>[0],
      'guild-1',
      { discordId: 'discord-1' },
    )

    expect(rpc).toHaveBeenCalledWith('member_battle_participations_for_member', {
      p_guild_id: 'guild-1',
      p_albion_player_id: null,
      p_discord_id: 'discord-1',
    })
    expect(result.discordByAlbionPlayerId.get('player-1')).toBe('discord-1')
  })
})
