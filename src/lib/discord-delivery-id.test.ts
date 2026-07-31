import { describe, expect, it } from 'vitest'
import { discordDeliveryNonce } from './discord-delivery-id'

describe('Discord delivery nonce', () => {
  const identity = {
    guildId: 'guild-a',
    topic: 'craft',
    sourceTable: 'supply_fulfillment',
    sourceId: 'source-a',
    deliveryKind: 'channel',
  }

  it('is deterministic and safe to send as a Discord numeric string', () => {
    const nonce = discordDeliveryNonce(identity)

    expect(discordDeliveryNonce(identity)).toBe(nonce)
    expect(nonce).toMatch(/^\d+$/)
    expect(BigInt(nonce)).toBeLessThan(2n ** 63n)
  })

  it('changes when any logical delivery identity changes', () => {
    for (const [key, value] of [
      ['guildId', 'guild-b'],
      ['topic', 'regear'],
      ['sourceTable', 'regear_requests'],
      ['sourceId', 'source-b'],
      ['deliveryKind', 'digest'],
    ] as const) {
      expect(discordDeliveryNonce({ ...identity, [key]: value })).not.toBe(
        discordDeliveryNonce(identity),
      )
    }
  })
})
