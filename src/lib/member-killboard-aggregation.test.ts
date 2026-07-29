import { describe, expect, it } from 'vitest'
import type { TrackedBattleWindow, TrackedBattles } from './tracked-kills'
import {
  aggregateKillboardRows,
  type KillboardRow,
} from './member-killboard-aggregation'

// 도메인 invariant 화석화: 멤버 상세 화면의 killboard 집계는
// (1) tracked window 안 row 만 카운트 (1:1 갱킹 제외),
// (2) fame 은 role 별로 분리 합산 (killer→killFame, victim→deathFame),
// (3) 무기군 카운트는 "1전투당 1회" — 같은 배틀의 여러 row 가 같은 무기군으로
//     중복 카운트되지 않는다,
// (4) killHistory 는 최신순 정렬 + 최대 50개.

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

function makeRow(overrides: Partial<KillboardRow> = {}): KillboardRow {
  // Spread overrides last — `??` would turn `{occurred_at: null}` back into the
  // default since null is nullish.
  return {
    event_id: 'e1',
    role: 'killer',
    fame: 1000,
    item_power: 1300,
    occurred_at: '2026-01-01T10:05:00.000Z',
    equipment: null,
    opponent_name: 'EnemyA',
    opponent_guild: 'EnemyGuild',
    opponent_alliance: null,
    battle_id: 42,
    ...overrides,
  }
}

describe('aggregateKillboardRows — tracked window 안 row 만 집계', () => {
  it('excludes rows outside tracked windows', () => {
    const tracked = makeTracked([makeWindow({ albionBattleId: 42 })])
    const rows: KillboardRow[] = [
      // tracked 안 (battle_id 42)
      makeRow({ role: 'killer', fame: 1000, battle_id: 42 }),
      // tracked 밖 (battle_id 999)
      makeRow({ role: 'killer', fame: 5000, battle_id: 999 }),
    ]
    const agg = aggregateKillboardRows(rows, tracked)
    expect(agg.killFame).toBe(1000)
    expect(agg.killHistory).toHaveLength(1)
  })

  it('separates killFame and deathFame by role', () => {
    const tracked = makeTracked([makeWindow({ albionBattleId: 42 })])
    const rows: KillboardRow[] = [
      makeRow({ role: 'killer', fame: 1000, battle_id: 42 }),
      makeRow({ role: 'killer', fame: 2000, battle_id: 42 }),
      makeRow({ role: 'victim', fame: 500, battle_id: 42 }),
    ]
    const agg = aggregateKillboardRows(rows, tracked)
    expect(agg.killFame).toBe(3000)
    expect(agg.deathFame).toBe(500)
  })

  it('skips rows without occurred_at', () => {
    const tracked = makeTracked([makeWindow({ albionBattleId: 42 })])
    const rows: KillboardRow[] = [
      makeRow({ role: 'killer', fame: 1000, occurred_at: null, battle_id: 42 }),
      makeRow({ role: 'killer', fame: 500, battle_id: 42 }),
    ]
    const agg = aggregateKillboardRows(rows, tracked)
    expect(agg.killFame).toBe(500)
    expect(agg.killHistory).toHaveLength(1)
  })
})

describe('aggregateKillboardRows — 무기군 집계는 1전투당 1회', () => {
  it('counts the same weapon category once per tracked battle', () => {
    const tracked = makeTracked([
      makeWindow({ albionBattleId: 42, rawStartedAt: '2026-01-01T10:00:00.000Z' }),
    ])
    // 한 배틀에서 같은 HOLYSTAFF 로 10킬을 내도 카운트는 1.
    const equipment = { MainHand: { Type: 'T8_MAIN_HOLYSTAFF' } }
    const rows: KillboardRow[] = Array.from({ length: 10 }, (_, i) =>
      makeRow({
        event_id: `e${i}`,
        role: 'killer',
        equipment,
        battle_id: 42,
      }),
    )
    const agg = aggregateKillboardRows(rows, tracked)
    expect(agg.observedWeaponUsage.categories).toHaveLength(1)
    expect(agg.observedWeaponUsage.categories[0]?.observationCount).toBe(1)
    expect(agg.observedWeaponUsage.categories[0]?.category).toBe('HOLYSTAFF')
    expect(agg.observedWeaponUsage.sampleCount).toBe(1)
  })

  it('counts separate battles separately for the same category', () => {
    const tracked = makeTracked([
      makeWindow({
        albionBattleId: 1,
        startedAtMs: Date.parse('2026-01-01T10:00:00.000Z'),
        rawStartedAt: '2026-01-01T10:00:00.000Z',
      }),
      makeWindow({
        albionBattleId: 2,
        startedAtMs: Date.parse('2026-01-02T10:00:00.000Z'),
        rawStartedAt: '2026-01-02T10:00:00.000Z',
      }),
    ])
    const equipment = { MainHand: { Type: 'T8_MAIN_HOLYSTAFF' } }
    const rows: KillboardRow[] = [
      makeRow({ role: 'killer', equipment, battle_id: 1, occurred_at: '2026-01-01T10:05:00.000Z' }),
      makeRow({ role: 'killer', equipment, battle_id: 2, occurred_at: '2026-01-02T10:05:00.000Z' }),
    ]
    const agg = aggregateKillboardRows(rows, tracked)
    expect(agg.observedWeaponUsage.categories[0]?.observationCount).toBe(2)
  })

  it('caps observed weapon categories at 10 while retaining the full sample count', () => {
    const windows = Array.from({ length: 12 }, (_, i) =>
      makeWindow({
        albionBattleId: i + 1,
        startedAtMs: Date.parse('2026-01-01T10:00:00.000Z') + i * 60 * 60 * 1000,
        rawStartedAt: new Date(
          Date.parse('2026-01-01T10:00:00.000Z') + i * 60 * 60 * 1000,
        ).toISOString(),
      }),
    )
    const tracked = makeTracked(windows)
    const rows: KillboardRow[] = windows.map((w, i) =>
      makeRow({
        role: 'killer',
        equipment: { MainHand: { Type: `T8_MAIN_WEAPON_${i}` } },
        battle_id: w.albionBattleId,
        occurred_at: new Date(w.startedAtMs + 60 * 1000).toISOString(),
      }),
    )
    const agg = aggregateKillboardRows(rows, tracked)
    expect(agg.observedWeaponUsage.categories).toHaveLength(10)
    expect(agg.observedWeaponUsage.sampleCount).toBe(12)
  })

  it('excludes actual equipment observations outside the rolling window', () => {
    const tracked = makeTracked([
      makeWindow({
        albionBattleId: 42,
        startedAtMs: Date.parse('2026-01-01T10:00:00.000Z'),
      }),
    ])
    const agg = aggregateKillboardRows(
      [
        makeRow({
          battle_id: 42,
          occurred_at: '2026-01-01T10:05:00.000Z',
          equipment: { MainHand: { Type: 'T8_MAIN_HOLYSTAFF' } },
        }),
      ],
      tracked,
      { observedWeaponWindowStart: '2026-01-02T00:00:00.000Z' },
    )

    expect(agg.observedWeaponUsage).toMatchObject({
      sampleCount: 0,
      categories: [],
    })
  })
})

describe('aggregateKillboardRows — killHistory 정렬과 cap', () => {
  it('sorts killHistory by occurred_at desc', () => {
    const tracked = makeTracked([makeWindow({ albionBattleId: 42 })])
    const rows: KillboardRow[] = [
      makeRow({ event_id: 'old', battle_id: 42, occurred_at: '2026-01-01T10:01:00.000Z' }),
      makeRow({ event_id: 'new', battle_id: 42, occurred_at: '2026-01-01T10:20:00.000Z' }),
      makeRow({ event_id: 'mid', battle_id: 42, occurred_at: '2026-01-01T10:10:00.000Z' }),
    ]
    const agg = aggregateKillboardRows(rows, tracked)
    expect(agg.killHistory.map((k) => k.event_id)).toEqual(['new', 'mid', 'old'])
  })

  it('caps killHistory at 50 entries', () => {
    // 51개의 row, 모두 같은 (시간창 안) battle 에 묶임. cap = 50.
    const tracked = makeTracked([
      makeWindow({
        albionBattleId: 42,
        startedAtMs: Date.parse('2026-01-01T10:00:00.000Z'),
        endedAtMs: Date.parse('2026-01-01T12:00:00.000Z'),
      }),
    ])
    const rows: KillboardRow[] = Array.from({ length: 60 }, (_, i) =>
      makeRow({
        event_id: `e${i}`,
        battle_id: 42,
        occurred_at: new Date(Date.parse('2026-01-01T10:00:00.000Z') + i * 1000).toISOString(),
      }),
    )
    const agg = aggregateKillboardRows(rows, tracked)
    expect(agg.killHistory).toHaveLength(50)
  })
})
