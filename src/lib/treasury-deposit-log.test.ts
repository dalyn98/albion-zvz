import { describe, expect, it } from 'vitest'
import { parseTreasuryDepositLog } from './treasury-deposit-log'

describe('parseTreasuryDepositLog', () => {
  it('parses three-column and explicit deposit rows', () => {
    const result = parseTreasuryDepositLog([
      'timestamp\tplayer\taction\tamount',
      '2026-08-01T03:04:05Z\tMember One\tDeposit\t1,250,000',
      '2026-08-01T04:04:05Z\tMember Two\t2_000',
    ].join('\n'))

    expect(result.skippedLines).toEqual([])
    expect(result.entries).toEqual([
      {
        depositedAt: '2026-08-01T03:04:05.000Z',
        depositorName: 'Member One',
        amountSilver: 1_250_000,
        fingerprintInput: '2026-08-01T03:04:05.000Z|member one|1250000',
      },
      {
        depositedAt: '2026-08-01T04:04:05.000Z',
        depositorName: 'Member Two',
        amountSilver: 2_000,
        fingerprintInput: '2026-08-01T04:04:05.000Z|member two|2000',
      },
    ])
  })

  it('rejects withdrawals, malformed values, and records their line numbers', () => {
    const result = parseTreasuryDepositLog([
      '2026-08-01T03:04:05Z\tMember One\tWithdraw\t1000',
      'not-a-date\tMember Two\tDeposit\t1000',
      '2026-08-01T03:04:05Z\tX\tDeposit\t1000',
      '2026-08-01T03:04:05Z\tMember Three\tDeposit\t-1',
    ].join('\n'))

    expect(result.entries).toEqual([])
    expect(result.skippedLines).toEqual([1, 2, 3, 4])
  })

  it('deduplicates identical evidence within one paste', () => {
    const line = '2026-08-01T03:04:05Z\tMember One\tDeposit\t1,000'
    const result = parseTreasuryDepositLog(`${line}\n${line}`)
    expect(result.entries).toHaveLength(1)
  })
})
