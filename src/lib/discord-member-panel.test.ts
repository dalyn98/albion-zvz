import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handleSlashCommand: vi.fn(),
  loadDiscordBotMessages: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/discord-commands', () => ({
  DEFAULT_DISCORD_COMMAND_LOCALE: 'en',
  handleSlashCommand: mocks.handleSlashCommand,
  loadDiscordBotMessages: mocks.loadDiscordBotMessages,
  resolveDiscordCommandLocale: () => 'ko',
}))

import {
  buildDiscordMemberPanelExchangeConfirmCustomId,
  parseDiscordMemberPanelCustomId,
} from './discord-member-panel-contract'
import {
  handleDiscordMemberPanelInteraction,
  shouldDeferDiscordMemberPanelInteraction,
} from './discord-member-panel'
import type { DiscordInteractionPayload } from './discord-interactions'

const messages = {
  unsupportedInteraction: 'unsupported',
  withdrawInvalidAmount: '1부터 {max}까지 입력하세요.',
  memberPanelExchangeModalTitle: '포인트 환전 신청',
  memberPanelExchangeAmountLabel: '환전할 포인트',
  memberPanelExchangeAmountPlaceholder: '예: 1000',
  memberPanelExchangeReview: '신청 금액 **{amount}p**를 확인하세요.',
  memberPanelExchangeConfirm: '환전 신청 확정',
  memberPanelCancel: '취소',
  memberPanelExchangeCancelled: '환전 신청을 취소했습니다.',
}

function payload(input: {
  customId: string
  type?: number
  components?: NonNullable<DiscordInteractionPayload['data']>['components']
}): DiscordInteractionPayload {
  return {
    id: 'interaction-1',
    application_id: 'application-1',
    token: 'token-1',
    type: input.type ?? 3,
    guild_id: '123456789012345678',
    channel_id: '234567890123456789',
    locale: 'ko',
    member: {
      user: { id: '345678901234567890', username: 'member' },
      roles: [],
    },
    data: {
      custom_id: input.customId,
      ...(input.components ? { components: input.components } : {}),
    },
  }
}

describe('Discord member panel contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadDiscordBotMessages.mockResolvedValue(messages)
    mocks.handleSlashCommand.mockResolvedValue({
      type: 4,
      data: { content: 'completed', flags: 64 },
    })
  })

  it('parses only bounded, versioned exchange confirmation amounts', () => {
    expect(buildDiscordMemberPanelExchangeConfirmCustomId(1_500)).toBe(
      'agm_member:v1:exchange_confirm:1500',
    )
    expect(parseDiscordMemberPanelCustomId(
      'agm_member:v1:exchange_confirm:1500',
    )).toEqual({ kind: 'exchange_confirm', amount: 1_500 })
    expect(parseDiscordMemberPanelCustomId('agm_member:v2:event')).toBeNull()
    expect(parseDiscordMemberPanelCustomId(
      'agm_member:v1:exchange_confirm:2147483648',
    )).toBeNull()
    expect(() => buildDiscordMemberPanelExchangeConfirmCustomId(0)).toThrow()
  })

  it('routes the event panel button through the existing event command suite', async () => {
    await handleDiscordMemberPanelInteraction(payload({ customId: 'agm_member:v1:event' }))

    expect(mocks.handleSlashCommand).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        name: 'agm',
        options: [{
          name: 'event',
          type: 2,
          options: [{ name: 'next', type: 1, options: [] }],
        }],
      },
    }))
  })

  it('opens an exchange modal without mutating financial state', async () => {
    const response = await handleDiscordMemberPanelInteraction(payload({
      customId: 'agm_member:v1:exchange',
    }))

    expect(response).toMatchObject({
      type: 9,
      data: {
        custom_id: 'agm_member:v1:exchange_submit',
        title: '포인트 환전 신청',
      },
    })
    expect(mocks.handleSlashCommand).not.toHaveBeenCalled()
  })

  it('requires a second click before submitting a normalized exchange amount', async () => {
    const review = await handleDiscordMemberPanelInteraction(payload({
      customId: 'agm_member:v1:exchange_submit',
      type: 5,
      components: [{ type: 18, component: { type: 4, custom_id: 'amount', value: '1,500' } }],
    }))

    expect(review.data?.content).toContain('1,500p')
    expect(review.data?.components?.[0]?.components).toEqual([
      expect.objectContaining({
        custom_id: 'agm_member:v1:exchange_confirm:1500',
      }),
      expect.objectContaining({
        custom_id: 'agm_member:v1:exchange_cancel',
      }),
    ])
    expect(mocks.handleSlashCommand).not.toHaveBeenCalled()

    await handleDiscordMemberPanelInteraction(payload({
      customId: 'agm_member:v1:exchange_confirm:1500',
    }))
    expect(mocks.handleSlashCommand).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        name: 'agm',
        options: [{
          name: 'wallet',
          type: 2,
          options: [{
            name: 'withdraw',
            type: 1,
            options: [{ name: 'amount', type: 4, value: 1_500 }],
          }],
        }],
      },
    }))
  })

  it('rejects malformed modal amounts before the existing withdrawal mutation', async () => {
    const response = await handleDiscordMemberPanelInteraction(payload({
      customId: 'agm_member:v1:exchange_submit',
      type: 5,
      components: [{ type: 18, component: { type: 4, custom_id: 'amount', value: '-1' } }],
    }))

    expect(response.data?.content).toContain('2,147,483,647')
    expect(mocks.handleSlashCommand).not.toHaveBeenCalled()
  })

  it('defers only database-backed panel actions', () => {
    expect(shouldDeferDiscordMemberPanelInteraction({
      data: { custom_id: 'agm_member:v1:event' },
    })).toBe(true)
    expect(shouldDeferDiscordMemberPanelInteraction({
      data: { custom_id: 'agm_member:v1:regear' },
    })).toBe(true)
    expect(shouldDeferDiscordMemberPanelInteraction({
      data: { custom_id: 'agm_member:v1:exchange_confirm:1500' },
    })).toBe(true)
    expect(shouldDeferDiscordMemberPanelInteraction({
      data: { custom_id: 'agm_member:v1:exchange' },
    })).toBe(false)
  })
})
