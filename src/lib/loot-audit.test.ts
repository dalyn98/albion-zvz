import { describe, expect, it } from 'vitest'
import {
  buildLootAuditSummary,
  parseDepositLog,
  parseLootLogCsv,
} from './loot-audit'

const SAMPLE_LOOT_CSV = [
  'timestamp_utc;looted_by__alliance;looted_by__guild;looted_by__name;item_id;item_name;quantity;looted_from__alliance;looted_from__guild;looted_from__name;died;died_player_guild;killed_by;killed_by_guild;average_est_market_value;cluster',
  '2026-05-24T05:00:01Z;RIFT;Menhera;MonKKu;T5_ARMOR_LEATHER_HELL@3;전문가의 지옥불 재킷;2;ARCH;Enemy;VictimA;false;Enemy;MonKKu;Menhera;125000;Battlebrae Flatland',
  '2026-05-24T05:01:02Z;RIFT;Menhera;MonKKu;T5_ARMOR_LEATHER_HELL@3;전문가의 지옥불 재킷;1;ARCH;Enemy;VictimB;false;Enemy;MonKKu;Menhera;125000;Battlebrae Flatland',
  '2026-05-24T05:02:03Z;RIFT;Menhera;OtherHealer;T4_TRASH;Trash;6;ARCH;Enemy;VictimC;false;Enemy;OtherHealer;Menhera;0;Battlebrae Flatland',
].join('\n')

const makeResolver = (name: string) => {
  if (name === '전문가의 지옥불 재킷') return 'T5_ARMOR_LEATHER_HELL'
  return null
}

describe('parseLootLogCsv', () => {
  it('parses semicolon-delimited Albion loot logger CSV rows', () => {
    const result = parseLootLogCsv(SAMPLE_LOOT_CSV)

    expect(result.entries).toHaveLength(3)
    expect(result.errors).toEqual([])
    expect(result.entries[0]).toMatchObject({
      lootedByName: 'MonKKu',
      itemId: 'T5_ARMOR_LEATHER_HELL@3',
      itemName: '전문가의 지옥불 재킷',
      quantity: 2,
      estimatedMarketValue: 125000,
      cluster: 'Battlebrae Flatland',
      line: 2,
    })
  })

  it('reports invalid numeric rows without dropping valid rows', () => {
    const raw = [
      'timestamp_utc;looted_by__name;item_id;item_name;quantity;average_est_market_value',
      '2026-05-24T05:00:01Z;MonKKu;T5_ARMOR_LEATHER_HELL@3;전문가의 지옥불 재킷;bad;100',
      '2026-05-24T05:00:02Z;MonKKu;T5_ARMOR_LEATHER_HELL@3;전문가의 지옥불 재킷;1;100',
    ].join('\n')

    const result = parseLootLogCsv(raw)

    expect(result.entries).toHaveLength(1)
    expect(result.errors).toEqual([
      expect.objectContaining({ line: 2, reason: expect.stringContaining('quantity') }),
    ])
  })
})

describe('parseDepositLog', () => {
  it('keeps only positive guild chest rows and resolves item ids with enchant', () => {
    const raw = [
      '"05/24/2026 14:05:00"\t"MonKKu"\t"전문가의 지옥불 재킷"\t"3"\t"1"\t"2"',
      '"05/24/2026 14:06:00"\t"MonKKu"\t"전문가의 지옥불 재킷"\t"3"\t"1"\t"-1"',
    ].join('\n')

    const result = parseDepositLog(raw, { resolveItemName: makeResolver })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({
      player: 'MonKKu',
      itemId: 'T5_ARMOR_LEATHER_HELL@3',
      quantity: 2,
      enchant: 3,
      quality: 1,
      line: 1,
    })
  })
})

describe('buildLootAuditSummary', () => {
  it('matches loot to same-member deposits and reports only missing quantity', () => {
    const loot = parseLootLogCsv(SAMPLE_LOOT_CSV).entries
    const deposits = parseDepositLog(
      '"05/24/2026 14:05:00"\t"MonKKu"\t"전문가의 지옥불 재킷"\t"3"\t"1"\t"2"',
      { resolveItemName: makeResolver },
    ).entries

    const summary = buildLootAuditSummary(loot, deposits, {
      homeGuildName: 'Menhera',
      homeAllianceNames: ['RIFT'],
    })

    expect(summary.totalLootRows).toBe(3)
    expect(summary.auditedLootRows).toBe(2)
    expect(summary.targetLootRows).toBe(2)
    expect(summary.externalLootRows).toBe(0)
    expect(summary.relationCounts).toEqual({ guild: 2, alliance: 0, other: 0 })
    expect(summary.totalEstimatedValue).toBe(375000)
    expect(summary.missingEstimatedValue).toBe(125000)
    expect(summary.findings).toEqual([
      expect.objectContaining({
        lootedByName: 'MonKKu',
        itemId: 'T5_ARMOR_LEATHER_HELL@3',
        expectedQuantity: 3,
        depositedQuantity: 2,
        missingQuantity: 1,
        unitEstimatedValue: 125000,
      }),
    ])
    expect(summary.checkRows).toEqual([
      expect.objectContaining({
        lootedByName: 'MonKKu',
        status: 'partial',
        expectedQuantity: 3,
        depositedQuantity: 2,
      }),
    ])
    expect(summary.depositCheckRows).toEqual([
      expect.objectContaining({
        player: 'MonKKu',
        itemId: 'T5_ARMOR_LEATHER_HELL@3',
        status: 'matched',
        expectedQuantity: 3,
        depositedQuantity: 2,
        matchedQuantity: 2,
        extraQuantity: 0,
        rowCount: 1,
      }),
    ])
  })

  it('does not count zero-value trash as a suspect finding', () => {
    const loot = parseLootLogCsv(SAMPLE_LOOT_CSV).entries
    const summary = buildLootAuditSummary(loot, [])

    expect(summary.ignoredLootRows).toBe(1)
    expect(summary.findings.map((f) => f.itemId)).not.toContain('T4_TRASH')
  })

  it('classifies looters as guild, alliance, or other for filtering', () => {
    const raw = [
      'timestamp_utc;looted_by__alliance;looted_by__guild;looted_by__name;item_id;item_name;quantity;looted_from__alliance;looted_from__guild;looted_from__name;died;died_player_guild;killed_by;killed_by_guild;average_est_market_value;cluster',
      '2026-05-24T05:00:01Z;RIFT;Menhera;MonKKu;T5_ARMOR_LEATHER_HELL@3;전문가의 지옥불 재킷;1;ARCH;Enemy;VictimA;false;Enemy;MonKKu;Menhera;100;Battlebrae Flatland',
      '2026-05-24T05:00:02Z;RIFT;AllyGuild;AllianceGuy;T5_ARMOR_LEATHER_HELL@3;전문가의 지옥불 재킷;1;ARCH;Enemy;VictimB;false;Enemy;AllianceGuy;AllyGuild;100;Battlebrae Flatland',
      '2026-05-24T05:00:03Z;NOPE;OtherGuild;Outsider;T5_ARMOR_LEATHER_HELL@3;전문가의 지옥불 재킷;1;ARCH;Enemy;VictimC;false;Enemy;Outsider;OtherGuild;100;Battlebrae Flatland',
    ].join('\n')
    const deposits = parseDepositLog(
      '"05/24/2026 14:05:00"\t"MonKKu"\t"전문가의 지옥불 재킷"\t"3"\t"1"\t"1"',
      { resolveItemName: makeResolver },
    ).entries

    const summary = buildLootAuditSummary(parseLootLogCsv(raw).entries, deposits, {
      homeGuildName: 'Menhera',
      homeAllianceNames: ['RIFT'],
    })

    expect(summary.relationCounts).toEqual({ guild: 1, alliance: 1, other: 1 })
    expect(summary.totalEstimatedValue).toBe(200)
    expect(summary.externalEstimatedValue).toBe(100)
    expect(summary.missingEstimatedValue).toBe(100)
    expect(summary.findings.map((finding) => finding.lootedByName)).toEqual(['AllianceGuy'])
    expect(summary.checkRows.map((row) => [row.lootedByName, row.looterRelation, row.status]))
      .toEqual([
        ['AllianceGuy', 'alliance', 'missing'],
        ['Outsider', 'other', 'missing'],
        ['MonKKu', 'guild', 'complete'],
      ])
  })

  it('lists extra and unresolved guild chest deposits for admin review', () => {
    const loot = parseLootLogCsv(SAMPLE_LOOT_CSV).entries
    const deposits = parseDepositLog(
      [
        '"05/24/2026 14:05:00"\t"MonKKu"\t"전문가의 지옥불 재킷"\t"3"\t"1"\t"4"',
        '"05/24/2026 14:06:00"\t"OtherBanker"\t"전문가의 지옥불 재킷"\t"3"\t"1"\t"1"',
        '"05/24/2026 14:07:00"\t"MonKKu"\t"매칭 안 되는 아이템"\t"0"\t"1"\t"2"',
      ].join('\n'),
      { resolveItemName: makeResolver },
    ).entries

    const summary = buildLootAuditSummary(loot, deposits)

    expect(summary.depositCheckRows.map((row) => ({
      player: row.player,
      itemId: row.itemId,
      status: row.status,
      depositedQuantity: row.depositedQuantity,
      expectedQuantity: row.expectedQuantity,
      matchedQuantity: row.matchedQuantity,
      extraQuantity: row.extraQuantity,
    }))).toEqual([
      {
        player: 'MonKKu',
        itemId: null,
        status: 'unresolved',
        depositedQuantity: 2,
        expectedQuantity: 0,
        matchedQuantity: 0,
        extraQuantity: 2,
      },
      {
        player: 'MonKKu',
        itemId: 'T5_ARMOR_LEATHER_HELL@3',
        status: 'extra',
        depositedQuantity: 4,
        expectedQuantity: 3,
        matchedQuantity: 3,
        extraQuantity: 1,
      },
      {
        player: 'OtherBanker',
        itemId: 'T5_ARMOR_LEATHER_HELL@3',
        status: 'extra',
        depositedQuantity: 1,
        expectedQuantity: 0,
        matchedQuantity: 0,
        extraQuantity: 1,
      },
    ])
  })

  it('keeps other looters as reference rows but excludes them from official findings', () => {
    const raw = [
      'timestamp_utc;looted_by__alliance;looted_by__guild;looted_by__name;item_id;item_name;quantity;looted_from__alliance;looted_from__guild;looted_from__name;died;died_player_guild;killed_by;killed_by_guild;average_est_market_value;cluster',
      '2026-05-24T05:00:01Z;NOPE;OtherGuild;Outsider;T5_ARMOR_LEATHER_HELL@3;전문가의 지옥불 재킷;2;ARCH;Enemy;VictimA;false;Enemy;Outsider;OtherGuild;500;Battlebrae Flatland',
    ].join('\n')

    const summary = buildLootAuditSummary(parseLootLogCsv(raw).entries, [], {
      homeGuildName: 'Menhera',
      homeAllianceNames: ['RIFT'],
    })

    expect(summary.relationCounts).toEqual({ guild: 0, alliance: 0, other: 1 })
    expect(summary.externalLootRows).toBe(1)
    expect(summary.totalEstimatedValue).toBe(0)
    expect(summary.externalEstimatedValue).toBe(1000)
    expect(summary.missingEstimatedValue).toBe(0)
    expect(summary.findings).toEqual([])
    expect(summary.checkRows).toEqual([
      expect.objectContaining({
        lootedByName: 'Outsider',
        looterRelation: 'other',
        missingQuantity: 2,
        missingEstimatedValue: 1000,
      }),
    ])
  })
})
