import { describe, expect, it } from 'vitest'
import {
  convertDiscordReplyToComponentsV2,
  deferredEphemeralReply,
  ephemeralReply,
  findDiscordModalValue,
  interactionResponseToWebhookMessage,
  INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
  INTERACTION_RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE,
  INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE,
  isDiscordSignatureTimestampFresh,
  messageUpdateReply,
  MESSAGE_FLAG_EPHEMERAL,
  MESSAGE_FLAG_IS_COMPONENTS_V2,
  MESSAGE_FLAG_SUPPRESS_EMBEDS,
} from './discord-interactions'

describe('findDiscordModalValue', () => {
  it('reads current Label-wrapped modal submissions', () => {
    const components = [{
      type: 18,
      component: {
        type: 4,
        custom_id: 'subject',
        value: 'Missing battle data',
      },
    }]

    expect(findDiscordModalValue(components, 'subject')).toBe('Missing battle data')
  })

  it('keeps compatibility with legacy Action Row submissions', () => {
    const components = [{
      type: 1,
      components: [{
        type: 4,
        custom_id: 'description',
        value: 'The battle has not appeared after synchronization.',
      }],
    }]

    expect(findDiscordModalValue(components, 'description'))
      .toBe('The battle has not appeared after synchronization.')
  })

  it('returns an empty value for missing or malformed components', () => {
    expect(findDiscordModalValue(undefined, 'subject')).toBe('')
    expect(findDiscordModalValue([{ type: 18 }], 'subject')).toBe('')
  })
})

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

  it('can suppress automatic embeds for bearer-link responses', () => {
    expect(ephemeralReply('Open the sign-in button', { suppressEmbeds: true })).toEqual({
      type: INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
      data: {
        content: 'Open the sign-in button',
        flags: MESSAGE_FLAG_EPHEMERAL | MESSAGE_FLAG_SUPPRESS_EMBEDS,
      },
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

  it('upgrades a deferred reply to Components V2 with the required webhook edit reset', () => {
    const response = convertDiscordReplyToComponentsV2(ephemeralReply('Done', { components: [] }))
    expect(response.data).toMatchObject({
      flags: MESSAGE_FLAG_EPHEMERAL | MESSAGE_FLAG_IS_COMPONENTS_V2,
      components: [{ type: 10, content: 'Done' }],
    })
    expect(response.data).not.toHaveProperty('content')

    expect(interactionResponseToWebhookMessage(response)).toEqual({
      content: null,
      flags: MESSAGE_FLAG_IS_COMPONENTS_V2,
      components: [{ type: 10, content: 'Done' }],
      allowed_mentions: { parse: [] },
    })
  })
})
