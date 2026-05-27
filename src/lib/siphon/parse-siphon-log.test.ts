import { describe, expect, it } from 'vitest'
import { parseSiphonLog } from './parse-siphon-log'

describe('parseSiphonLog', () => {
  it('parses the 4-column siphon ledger export format', () => {
    const raw = [
      '"날짜"\t"플레이어"\t"목적"\t"수량"',
      '"2026-05-24 17:48:30"\t"MonKKu"\t"입금"\t"7"',
      '"2026-05-24 15:15:00"\t"SEXYECHAN"\t"출금"\t"-10"',
      '"2026-05-24 13:33:08"\t"shuffler"\t"출금"\t"5"',
    ].join('\n')

    const result = parseSiphonLog(raw)

    expect(result.errors).toEqual([])
    expect(result.parsedTotal).toBe(3)
    expect(result.nonSiphonRows).toBe(0)
    expect(result.entries).toHaveLength(3)
    expect(result.entries.map((entry) => entry.player)).toEqual([
      'MonKKu',
      'SEXYECHAN',
      'shuffler',
    ])
    expect(result.entries.map((entry) => entry.quantity)).toEqual([7, -10, -5])
    expect(result.entries[0]).toMatchObject({
      itemName: 'Siphoned Energy',
      enchant: 0,
      quality: 1,
    })
    expect(result.entries[0].loggedAt.toISOString()).toBe('2026-05-24T17:48:30.000Z')
  })

  it('accepts localized ledger headers and purpose labels', () => {
    const raw = [
      '"Date"\t"Player"\t"Purpose"\t"Quantity"',
      '"2026-05-24 17:48:30"\t"MonKKu"\t"Deposit"\t"7"',
      '"2026-05-24 15:15:00"\t"SEXYECHAN"\t"Withdrawal"\t"10"',
      '"2026-05-24 15:14:34"\t"caxtoy"\t"預け入れ"\t"3"',
      '"2026-05-24 15:10:16"\t"Tagilla"\t"提取"\t"2"',
    ].join('\n')

    const result = parseSiphonLog(raw)

    expect(result.errors).toEqual([])
    expect(result.entries.map((entry) => entry.quantity)).toEqual([7, -10, 3, -2])
  })

  it('keeps legacy 6-column guild chest siphon rows for backwards compatibility', () => {
    const raw = [
      '"05/24/2026 14:05:00"\t"MonKKu"\t"착취한 에너지"\t"0"\t"1"\t"7"',
      '"05/24/2026 14:06:00"\t"MonKKu"\t"전문가의 지옥불 재킷"\t"3"\t"1"\t"1"',
    ].join('\n')

    const result = parseSiphonLog(raw)

    expect(result.errors).toEqual([])
    expect(result.parsedTotal).toBe(2)
    expect(result.nonSiphonRows).toBe(1)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({
      player: 'MonKKu',
      itemName: '착취한 에너지',
      quantity: 7,
    })
  })

  it('reports invalid 4-column rows without dropping valid rows', () => {
    const raw = [
      '"날짜"\t"플레이어"\t"목적"\t"수량"',
      '"2026-05-24 17:48:30"\t"MonKKu"\t"입금"\t"7"',
      '"2026-02-31 17:48:30"\t"MonKKu"\t"입금"\t"7"',
      '"2026-05-24 17:49:00"\t"MonKKu"\t"이동"\t"7"',
      '"2026-05-24 17:50:00"\t"MonKKu"\t"출금"\t"0"',
    ].join('\n')

    const result = parseSiphonLog(raw)

    expect(result.entries).toHaveLength(1)
    expect(result.errors).toEqual([
      expect.objectContaining({
        line: 3,
        code: 'ledger_date',
        reason: expect.stringContaining('날짜'),
      }),
      expect.objectContaining({
        line: 4,
        code: 'ledger_purpose',
        reason: expect.stringContaining('목적'),
      }),
      expect.objectContaining({
        line: 5,
        code: 'ledger_quantity_zero',
        reason: expect.stringContaining('0'),
      }),
    ])
  })
})
