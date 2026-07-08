import { describe, expect, it } from 'vitest'
import {
  deferredEphemeralReply,
  ephemeralReply,
  interactionResponseToWebhookMessage,
  INTERACTION_RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE,
  INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE,
  isDiscordSignatureTimestampFresh,
  messageUpdateReply,
  MESSAGE_FLAG_EPHEMERAL,
} from './discord-interactions'

describe('isDiscordSignatureTimestampFresh', () => {
  const nowMs = Date.UTC(2026, 0, 1, 0, 0, 0)
  const nowSeconds = Math.floor(nowMs / 1000)

  it('accepts timestamps inside the replay window', () => {
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds), { nowMs })).toBe(true)
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds - 300), { nowMs })).toBe(true)
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds + 300), { nowMs })).toBe(true)
  })

  it('rejects stale or far-future timestamps', () => {
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds - 301), { nowMs })).toBe(false)
    expect(isDiscordSignatureTimestampFresh(String(nowSeconds + 301), { nowMs })).toBe(false)
  })

  it('rejects malformed timestamps', () => {
    expect(isDiscordSignatureTimestampFresh('', { nowMs })).toBe(false)
    expect(isDiscordSignatureTimestampFresh('123.5', { nowMs })).toBe(false)
    expect(isDiscordSignatureTimestampFresh('not-a-time', { nowMs })).toBe(false)
  })
})

describe('deferred Discord interaction responses', () => {
  it('acks expensive interactions as ephemeral loading responses', () => {
    expect(deferredEphemeralReply()).toEqual({
      type: INTERACTION_RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE,
      data: { flags: MESSAGE_FLAG_EPHEMERAL },
    })
  })

  it('converts channel responses to webhook edit payloads without response-only flags', () => {
    const message = interactionResponseToWebhookMessage(
      ephemeralReply('Done <@123>', {
        components: [
          {
            type: 1,
            components: [{ type: 2, style: 5, label: 'Open', url: 'https://example.test' }],
          },
        ],
      }),
    )

    expect(message).toEqual({
      content: 'Done <@123>',
      components: [
        {
          type: 1,
          components: [{ type: 2, style: 5, label: 'Open', url: 'https://example.test' }],
        },
      ],
      allowed_mentions: { parse: [] },
    })
    expect(message).not.toHaveProperty('flags')
  })

  it('converts message update responses so deferred component buttons can be cleared', () => {
    const message = interactionResponseToWebhookMessage(
      messageUpdateReply('Done', {
        components: [],
      }),
    )

    expect(messageUpdateReply('Done').type).toBe(INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE)
    expect(message).toEqual({
      content: 'Done',
      components: [],
      allowed_mentions: { parse: [] },
    })
  })
})
