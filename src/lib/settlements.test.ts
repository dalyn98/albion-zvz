import { describe, expect, it } from 'vitest'
import { buildSettlementLines } from './settlements'

describe('buildSettlementLines', () => {
  const periodStartIso = '2026-04-01T00:00:00.000Z'
  const periodEndIso = '2026-05-01T00:00:00.000Z'

  it('separates opening balance from in-period earned and spent', () => {
    const lines = buildSettlementLines({
      periodStartIso,
      periodEndIso,
      members: [{ discordId: 'u1', username: 'Alice' }],
      ledgerRows: [
        { discordId: 'u1', delta: 1000, reason: 'regear_approved', createdAt: '2026-03-31T23:59:59.000Z' },
        { discordId: 'u1', delta: 500, reason: 'donation_approved', createdAt: '2026-04-10T00:00:00.000Z' },
        { discordId: 'u1', delta: -300, reason: 'exchange_paid', createdAt: '2026-04-20T00:00:00.000Z' },
        { discordId: 'u1', delta: 999, reason: 'regear_approved', createdAt: '2026-05-01T00:00:00.000Z' },
      ],
    })

    expect(lines).toEqual([
      {
        discordId: 'u1',
        username: 'Alice',
        openingBalance: 1000,
        earned: 500,
        spent: 300,
        closingBalance: 1200,
        receivableSilver: 1200,
        payableSilver: 0,
        ledgerEntryCount: 2,
        sourceBreakdown: { donation_approved: 500 },
        sinkBreakdown: { exchange_paid: 300 },
      },
    ])
  })

  it('marks negative closing balances as member payable amount', () => {
    const lines = buildSettlementLines({
      periodStartIso,
      periodEndIso,
      ledgerRows: [
        { discordId: 'u2', delta: -700, reason: 'admin_adjust', createdAt: '2026-04-02T00:00:00.000Z' },
      ],
    })

    expect(lines[0]).toMatchObject({
      discordId: 'u2',
      closingBalance: -700,
      receivableSilver: 0,
      payableSilver: 700,
    })
  })

  it('sorts receivable balances first, then payable balances', () => {
    const lines = buildSettlementLines({
      periodStartIso,
      periodEndIso,
      ledgerRows: [
        { discordId: 'low', delta: 100, reason: 'regear_approved', createdAt: '2026-04-02T00:00:00.000Z' },
        { discordId: 'high', delta: 500, reason: 'regear_approved', createdAt: '2026-04-02T00:00:00.000Z' },
        { discordId: 'payable', delta: -300, reason: 'admin_adjust', createdAt: '2026-04-02T00:00:00.000Z' },
      ],
    })

    expect(lines.map((line) => line.discordId)).toEqual(['high', 'low', 'payable'])
  })
})
