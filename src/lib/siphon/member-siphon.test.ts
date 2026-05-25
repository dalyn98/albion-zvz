import { describe, expect, it } from 'vitest'
import { resolveSiphonPlayer, summarizeSiphonAccount } from './member-siphon'

describe('summarizeSiphonAccount', () => {
  it('calculates deposit, withdrawal, net balance, and latest activity', () => {
    const summary = summarizeSiphonAccount(
      'Eternia',
      [
        { loggedAt: '2026-05-20T10:00:00Z', itemNameRaw: 'Siphoned Energy', quantity: 25 },
        { loggedAt: '2026-05-21T10:00:00Z', itemNameRaw: '착취한 에너지', quantity: -7 },
        { loggedAt: '2026-05-19T10:00:00Z', itemNameRaw: 'Siphoned Energy', quantity: 5 },
      ],
      10,
    )

    expect(summary.deposited).toBe(30)
    expect(summary.withdrawn).toBe(7)
    expect(summary.net).toBe(23)
    expect(summary.lastActivityAt).toBe('2026-05-21T10:00:00Z')
    expect(summary.rows.map((row) => row.quantity)).toEqual([-7, 25, 5])
  })

  it('limits recent rows without changing totals', () => {
    const summary = summarizeSiphonAccount(
      'Eternia',
      [
        { loggedAt: '2026-05-18T10:00:00Z', itemNameRaw: 'Siphoned Energy', quantity: 10 },
        { loggedAt: '2026-05-19T10:00:00Z', itemNameRaw: 'Siphoned Energy', quantity: -3 },
        { loggedAt: '2026-05-20T10:00:00Z', itemNameRaw: 'Siphoned Energy', quantity: 2 },
      ],
      2,
    )

    expect(summary.net).toBe(9)
    expect(summary.rows).toHaveLength(2)
    expect(summary.rows.map((row) => row.loggedAt)).toEqual([
      '2026-05-20T10:00:00Z',
      '2026-05-19T10:00:00Z',
    ])
  })
})

describe('resolveSiphonPlayer', () => {
  it('uses trusted account identity nicknames even when legacy avatar verification is empty', () => {
    expect(
      resolveSiphonPlayer({
        resourceTrusted: true,
        identity: { nickname: '  MonKKu  ' },
      }),
    ).toEqual({ status: 'ready', player: 'MonKKu' })
  })

  it('does not expose siphon balances while account identity still needs review', () => {
    expect(
      resolveSiphonPlayer({
        resourceTrusted: false,
        identity: { nickname: 'MonKKu' },
      }),
    ).toEqual({ status: 'unverified', nickname: 'MonKKu' })
  })
})
