import { describe, expect, it } from 'vitest'
import {
  MAX_MEMBER_EXCHANGE_RESTRICTION_DAYS,
  normalizeMemberExchangeRestriction,
} from './member-exchange-restrictions'

const NOW = new Date('2026-07-28T00:00:00.000Z')

describe('normalizeMemberExchangeRestriction', () => {
  it('trims and normalizes a bounded future restriction', () => {
    expect(normalizeMemberExchangeRestriction({
      discordId: ' 123456789 ',
      blockedUntil: '2026-07-29T00:00:00.000Z',
      reason: '  운영 확인 필요  ',
    }, NOW)).toEqual({
      ok: true,
      value: {
        discordId: '123456789',
        blockedUntil: '2026-07-29T00:00:00.000Z',
        reason: '운영 확인 필요',
      },
    })
  })

  it('rejects past, overlong, empty-reason, and local-account restrictions', () => {
    expect(normalizeMemberExchangeRestriction({
      discordId: 'member-1',
      blockedUntil: NOW.toISOString(),
      reason: 'reason',
    }, NOW)).toMatchObject({ ok: false, code: 'invalidExpiry' })

    expect(normalizeMemberExchangeRestriction({
      discordId: 'member-1',
      blockedUntil: new Date(
        NOW.getTime() + (MAX_MEMBER_EXCHANGE_RESTRICTION_DAYS + 1) * 86_400_000,
      ).toISOString(),
      reason: 'reason',
    }, NOW)).toMatchObject({ ok: false, code: 'expiryTooLong' })

    expect(normalizeMemberExchangeRestriction({
      discordId: 'member-1',
      blockedUntil: '2026-07-29T00:00:00.000Z',
      reason: ' ',
    }, NOW)).toMatchObject({ ok: false, code: 'reasonRequired' })

    expect(normalizeMemberExchangeRestriction({
      discordId: 'local:account-1',
      blockedUntil: '2026-07-29T00:00:00.000Z',
      reason: 'reason',
    }, NOW)).toMatchObject({ ok: false, code: 'invalidMember' })
  })
})
