import { describe, expect, it } from 'vitest'
import {
  deriveDiscordConfirmationIdempotencyKey,
  isApplicationCommandIdempotencyKey,
  stableApplicationCommandJson,
} from './application-command-idempotency'

const guildId = '11111111-1111-4111-8111-111111111111'
const confirmationToken = '22222222-2222-4222-8222-222222222222'

describe('application command idempotency', () => {
  it('derives a stable UUID from the tenant, interaction, token, and command', () => {
    const input = {
      guildId,
      interactionId: '123456789012345678',
      confirmationToken,
      commandName: 'shop.order',
    }
    const first = deriveDiscordConfirmationIdempotencyKey(input)
    const second = deriveDiscordConfirmationIdempotencyKey(input)

    expect(first).toBe(second)
    expect(isApplicationCommandIdempotencyKey(first)).toBe(true)
    expect(
      deriveDiscordConfirmationIdempotencyKey({
        ...input,
        commandName: 'point.transfer',
      }),
    ).not.toBe(first)
  })

  it('rejects malformed tenant, token, and interaction identities', () => {
    expect(() =>
      deriveDiscordConfirmationIdempotencyKey({
        guildId: 'not-a-uuid',
        interactionId: '123456789012345678',
        confirmationToken,
        commandName: 'shop.order',
      }),
    ).toThrow('application_command_confirmation_identity_invalid')
    expect(() =>
      deriveDiscordConfirmationIdempotencyKey({
        guildId,
        interactionId: 'not-a-snowflake',
        confirmationToken,
        commandName: 'shop.order',
      }),
    ).toThrow('application_command_interaction_invalid')
  })

  it('compares JSON objects independent of key order without reordering arrays', () => {
    expect(stableApplicationCommandJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableApplicationCommandJson({ a: { c: 3, d: 4 }, b: 2 }),
    )
    expect(stableApplicationCommandJson({ values: [1, 2] })).not.toBe(
      stableApplicationCommandJson({ values: [2, 1] }),
    )
    expect(stableApplicationCommandJson(undefined)).toBe('null')
  })
})
