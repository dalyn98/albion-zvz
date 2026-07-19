import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAdminApprovalCustomId,
  buildAdminApprovalMessageComponents,
  handleDiscordAdminApprovalInteraction,
  isDiscordAdminApprovalCustomId,
  parseAdminApprovalCustomId,
  resolveAdminApprovalKind,
  shouldDeferDiscordAdminApprovalInteraction,
  shouldUpdateDiscordAdminApprovalInteractionMessage,
  syncDiscordAdminApprovalNotification,
} from './discord-admin-approvals'
import {
  INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE,
  INTERACTION_TYPE_MESSAGE_COMPONENT,
  INTERACTION_TYPE_MODAL_SUBMIT,
} from './discord-interactions'

vi.mock('@/lib/discord-admin-auth', () => ({
  resolveDiscordAdminApprovalActor: vi.fn(),
}))

vi.mock('@/lib/admin-approval-service', () => ({
  approveExchangeRequestForActor: vi.fn(),
}))

const deliveryMocks = vi.hoisted(() => ({
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      update: deliveryMocks.update,
    })),
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  const filter = {
    eq: deliveryMocks.eq,
    select: deliveryMocks.select,
  }
  deliveryMocks.update.mockReturnValue(filter)
  deliveryMocks.eq.mockReturnValue(filter)
  deliveryMocks.select.mockReturnValue({ maybeSingle: deliveryMocks.maybeSingle })
  deliveryMocks.maybeSingle.mockResolvedValue({ data: null, error: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.DISCORD_BOT_TOKEN
})

describe('Discord admin approval custom ids', () => {
  const sourceId = '11111111-1111-4111-8111-111111111111'

  it('round-trips an admin approval action', () => {
    const customId = buildAdminApprovalCustomId('exchange', 'confirm_approve', sourceId)

    expect(isDiscordAdminApprovalCustomId(customId)).toBe(true)
    expect(parseAdminApprovalCustomId(customId)).toEqual({
      kind: 'exchange',
      action: 'confirm_approve',
      sourceId,
    })
  })

  it('rejects malformed or unsupported custom ids', () => {
    expect(parseAdminApprovalCustomId('agm_evt:v1:intent:11111111-1111-4111-8111-111111111111')).toBeNull()
    expect(parseAdminApprovalCustomId('agm_admin:v1:sync:confirm_approve:11111111-1111-4111-8111-111111111111')).toBeNull()
    expect(parseAdminApprovalCustomId('agm_admin:v1:exchange:confirm_approve:not-a-uuid')).toBeNull()
  })

  it('defers state-changing confirmation and modal submit actions', () => {
    expect(
      shouldDeferDiscordAdminApprovalInteraction({
        id: 'interaction-1',
        type: INTERACTION_TYPE_MESSAGE_COMPONENT,
        application_id: 'app-1',
        token: 'token-1',
        data: {
          custom_id: buildAdminApprovalCustomId('exchange', 'confirm_approve', sourceId),
        },
      }),
    ).toBe(true)

    expect(
      shouldDeferDiscordAdminApprovalInteraction({
        id: 'interaction-2',
        type: INTERACTION_TYPE_MODAL_SUBMIT,
        application_id: 'app-1',
        token: 'token-1',
        data: {
          custom_id: buildAdminApprovalCustomId('exchange', 'reject_submit', sourceId),
        },
      }),
    ).toBe(true)

    expect(
      shouldDeferDiscordAdminApprovalInteraction({
        id: 'interaction-3',
        type: INTERACTION_TYPE_MESSAGE_COMPONENT,
        application_id: 'app-1',
        token: 'token-1',
        data: {
          custom_id: buildAdminApprovalCustomId('exchange', 'prompt_approve', sourceId),
        },
      }),
    ).toBe(false)
  })

  it('updates the private confirmation message for confirm and cancel buttons', () => {
    expect(
      shouldUpdateDiscordAdminApprovalInteractionMessage({
        id: 'interaction-1',
        type: INTERACTION_TYPE_MESSAGE_COMPONENT,
        data: {
          custom_id: buildAdminApprovalCustomId('exchange', 'confirm_approve', sourceId),
        },
      }),
    ).toBe(true)

    expect(
      shouldUpdateDiscordAdminApprovalInteractionMessage({
        id: 'interaction-2',
        type: INTERACTION_TYPE_MESSAGE_COMPONENT,
        data: {
          custom_id: buildAdminApprovalCustomId('exchange', 'cancel', sourceId),
        },
      }),
    ).toBe(true)

    expect(
      shouldUpdateDiscordAdminApprovalInteractionMessage({
        id: 'interaction-3',
        type: INTERACTION_TYPE_MESSAGE_COMPONENT,
        data: {
          custom_id: buildAdminApprovalCustomId('exchange', 'prompt_approve', sourceId),
        },
      }),
    ).toBe(false)

    expect(
      shouldUpdateDiscordAdminApprovalInteractionMessage({
        id: 'interaction-4',
        type: INTERACTION_TYPE_MODAL_SUBMIT,
        data: {
          custom_id: buildAdminApprovalCustomId('exchange', 'reject_submit', sourceId),
        },
      }),
    ).toBe(false)
  })

  it('only marks supported notification sources as actionable', () => {
    expect(
      resolveAdminApprovalKind({
        topic: 'exchange',
        sourceTable: 'exchange_requests',
        sourceId,
      }),
    ).toBe('exchange')
    expect(
      resolveAdminApprovalKind({
        topic: 'sync',
        sourceTable: 'admin_notification_digest',
        sourceId,
      }),
    ).toBeNull()
    expect(
      resolveAdminApprovalKind({
        topic: 'regear',
        sourceTable: 'events',
        sourceId,
      }),
    ).toBeNull()
  })

  it('builds regear messages with silver, stock, craft, reject, and open buttons', () => {
    const components = buildAdminApprovalMessageComponents({
      kind: 'regear',
      sourceId,
      url: '/admin/dashboard/approvals',
      tenantSlug: null,
      messages: {
        approveButton: '승인',
        rejectButton: '거절',
        openButton: '열기',
        regearSilverButton: '실버',
        regearStockButton: '재고',
        regearCraftButton: '제작',
        confirmApproveButton: '확정',
        confirmRejectButton: '거절 확정',
        cancelButton: '취소',
        unsupported: '',
        notAuthorized: '',
        notInGuild: '',
        guildNotLinked: '',
        confirmApprove: '',
        confirmStock: '',
        confirmCrafted: '',
        cancelDone: '',
        rejectModalTitle: '',
        rejectModalLabel: '',
        rejectModalPlaceholder: '',
        approved: '',
        stocked: '',
        crafted: '',
        rejected: '',
        failed: '',
        handledButton: '',
      },
    })

    expect(components[0]?.components).toHaveLength(5)
    expect(components[0]?.components.map((component) => 'label' in component ? component.label : '')).toEqual([
      '실버',
      '재고',
      '제작',
      '거절',
      '열기',
    ])
  })
})

describe('handleDiscordAdminApprovalInteraction', () => {
  const sourceId = '11111111-1111-4111-8111-111111111111'

  it('routes exchange approval through the Discord actor-aware service', async () => {
    const auth = await import('@/lib/discord-admin-auth')
    const service = await import('@/lib/admin-approval-service')
    vi.mocked(auth.resolveDiscordAdminApprovalActor).mockResolvedValue({
      ok: true,
      actor: {
        guildId: 'guild-1',
        discordGuildId: 'discord-guild-1',
        discordId: 'admin-1',
        username: 'Officer',
      },
    })
    vi.mocked(service.approveExchangeRequestForActor).mockResolvedValue({})

    const response = await handleDiscordAdminApprovalInteraction({
      id: 'interaction-1',
      type: INTERACTION_TYPE_MESSAGE_COMPONENT,
      guild_id: 'discord-guild-1',
      channel_id: 'channel-1',
      member: {
        roles: ['role-1'],
        user: { id: 'admin-1', username: 'Officer' },
      },
      data: {
        custom_id: buildAdminApprovalCustomId('exchange', 'confirm_approve', sourceId),
      },
    })

    expect(auth.resolveDiscordAdminApprovalActor).toHaveBeenCalledWith(
      expect.objectContaining({ guild_id: 'discord-guild-1' }),
      expect.arrayContaining([expect.any(BigInt)]),
    )
    expect(service.approveExchangeRequestForActor).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ guildId: 'guild-1', discordId: 'admin-1' }),
        id: sourceId,
      }),
    )
    expect(response.type).toBe(INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE)
    expect(response.data?.content).toContain('승인')
    expect(response.data?.components).toEqual([])
  })
})

describe('syncDiscordAdminApprovalNotification', () => {
  const sourceId = '11111111-1111-4111-8111-111111111111'

  it('tenant-scopes the delivery update and disables the original Discord approval message', async () => {
    deliveryMocks.maybeSingle.mockResolvedValue({
      data: {
        discord_channel_id: 'channel-1',
        discord_message_id: 'message-1',
      },
      error: null,
    })
    process.env.DISCORD_BOT_TOKEN = 'test-token'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(syncDiscordAdminApprovalNotification({
      actor: {
        guildId: 'guild-1',
        discordId: 'admin-1',
        username: 'Officer',
      },
      kind: 'exchange',
      sourceId,
      resolution: 'approved',
    })).resolves.toBeUndefined()

    expect(deliveryMocks.update).toHaveBeenCalledWith(expect.objectContaining({
      action_status: '승인되었습니다.',
      action_by_discord_id: 'admin-1',
      action_by_username: 'Officer',
      action_at: expect.any(String),
    }))
    expect(deliveryMocks.eq.mock.calls).toEqual([
      ['guild_id', 'guild-1'],
      ['topic', 'exchange'],
      ['source_table', 'exchange_requests'],
      ['source_id', sourceId],
      ['delivery_kind', 'channel'],
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/channel-1/messages/message-1',
      expect.objectContaining({ method: 'PATCH' }),
    )
    const request = fetchMock.mock.calls[0]?.[1] as { body?: string }
    expect(JSON.parse(request.body ?? '{}')).toEqual({
      components: [
        {
          type: 1,
          components: [
            expect.objectContaining({
              disabled: true,
              label: '승인되었습니다 · Officer',
            }),
          ],
        },
      ],
    })
  })

  it('keeps site approval successful when Discord patching fails', async () => {
    deliveryMocks.maybeSingle.mockResolvedValue({
      data: {
        discord_channel_id: 'channel-1',
        discord_message_id: 'message-1',
      },
      error: null,
    })
    process.env.DISCORD_BOT_TOKEN = 'test-token'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Discord unavailable')))

    await expect(syncDiscordAdminApprovalNotification({
      actor: {
        guildId: 'guild-1',
        discordId: 'admin-1',
        username: 'Officer',
      },
      kind: 'regear',
      sourceId,
      resolution: 'stocked',
    })).resolves.toBeUndefined()
  })

  it.each([
    ['stocked', '재고 출고로 승인되었습니다.'],
    ['crafted', '제작 큐로 보냈습니다.'],
    ['rejected', '거절되었습니다.'],
  ] as const)('records the %s resolution with the Discord label', async (resolution, status) => {
    await syncDiscordAdminApprovalNotification({
      actor: {
        guildId: 'guild-1',
        discordId: 'admin-1',
        username: 'Officer',
      },
      kind: 'regear',
      sourceId,
      resolution,
    })

    expect(deliveryMocks.update).toHaveBeenCalledWith(expect.objectContaining({
      action_status: status,
    }))
  })
})
