import { describe, expect, it } from 'vitest'
import {
  buildDiscordEventSignupComponents,
  handleDiscordEventInteraction,
  shouldDeferDiscordEventInteraction,
} from './discord-event-signups'
import {
  INTERACTION_RESPONSE_TYPE_MODAL,
  type DiscordInteractionPayload,
} from './discord-interactions'

describe('buildDiscordEventSignupComponents', () => {
  it('builds a compact event signup panel without enumerating every slot', () => {
    const components = buildDiscordEventSignupComponents({
      eventId: '11111111-1111-4111-8111-111111111111',
      eventUrl: 'https://guild.example/events/11111111-1111-4111-8111-111111111111',
      labels: {
        intentButton: 'Intent',
        codeButton: 'Code',
        browseButton: 'Browse',
        statusButton: 'Status',
        openButton: 'Open',
      },
    })

    expect(components).toHaveLength(1)
    expect(components[0].components).toHaveLength(5)
    expect(components[0].components[0]).toMatchObject({
      type: 2,
      style: 1,
      custom_id: 'agm_evt:v1:intent:11111111-1111-4111-8111-111111111111',
    })
    expect(components[0].components[4]).toMatchObject({
      type: 2,
      style: 5,
      url: 'https://guild.example/events/11111111-1111-4111-8111-111111111111',
    })
  })
})

describe('handleDiscordEventInteraction', () => {
  it('opens a localized slot-code modal without enumerating slots', async () => {
    const response = await handleDiscordEventInteraction({
      id: 'interaction-1',
      type: 3,
      locale: 'zh-CN',
      data: {
        custom_id: 'agm_evt:v1:code:11111111-1111-4111-8111-111111111111',
      },
    } as DiscordInteractionPayload)

    expect(response.type).toBe(INTERACTION_RESPONSE_TYPE_MODAL)
    expect(response.data).toMatchObject({
      custom_id: 'agm_evt:v1:code_submit:11111111-1111-4111-8111-111111111111',
      title: '用槽位代码报名',
    })
    expect(response.data?.components?.[0]?.components?.[0]).toMatchObject({
      type: 4,
      custom_id: 'slot_code',
      placeholder: '例: A01',
    })
  })

  it('rejects unknown component IDs before any guild lookup', async () => {
    const response = await handleDiscordEventInteraction({
      id: 'interaction-1',
      type: 3,
      locale: 'en-US',
      data: {
        custom_id: 'other:v1:code:11111111-1111-4111-8111-111111111111',
      },
    } as DiscordInteractionPayload)

    expect(response.data?.content).toBe(
      'Something went wrong while handling this event action. Please try again later.',
    )
  })
})

describe('shouldDeferDiscordEventInteraction', () => {
  it('defers database-backed component and modal-submit actions when a follow-up token is present', () => {
    expect(
      shouldDeferDiscordEventInteraction({
        id: 'interaction-1',
        application_id: 'app-1',
        token: 'token-1',
        type: 3,
        data: {
          custom_id: 'agm_evt:v1:browse:11111111-1111-4111-8111-111111111111',
        },
      } as DiscordInteractionPayload),
    ).toBe(true)

    expect(
      shouldDeferDiscordEventInteraction({
        id: 'interaction-2',
        application_id: 'app-1',
        token: 'token-1',
        type: 5,
        data: {
          custom_id: 'agm_evt:v1:code_submit:11111111-1111-4111-8111-111111111111',
        },
      } as DiscordInteractionPayload),
    ).toBe(true)
  })

  it('does not defer code buttons because Discord requires an immediate modal response', () => {
    expect(
      shouldDeferDiscordEventInteraction({
        id: 'interaction-1',
        application_id: 'app-1',
        token: 'token-1',
        type: 3,
        data: {
          custom_id: 'agm_evt:v1:code:11111111-1111-4111-8111-111111111111',
        },
      } as DiscordInteractionPayload),
    ).toBe(false)
  })
})
