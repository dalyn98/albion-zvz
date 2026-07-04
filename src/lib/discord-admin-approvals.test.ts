import { describe, expect, it, vi } from 'vitest'
import {
  buildAdminApprovalCustomId,
  buildAdminApprovalMessageComponents,
  handleDiscordAdminApprovalInteraction,
  isDiscordAdminApprovalCustomId,
  parseAdminApprovalCustomId,
  resolveAdminApprovalKind,
  shouldDeferDiscordAdminApprovalInteraction,
} from './discord-admin-approvals'
import { INTERACTION_TYPE_MESSAGE_COMPONENT, INTERACTION_TYPE_MODAL_SUBMIT } from './discord-interactions'

vi.mock('@/lib/discord-admin-auth', () => ({
  resolveDiscordAdminApprovalActor: vi.fn(),
}))

vi.mock('@/lib/admin-approval-service', () => ({
  approveExchangeRequestForActor: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                  })),
                })),
              })),
            })),
          })),
        })),
      })),
    })),
  })),
}))

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
    expect(response.data?.content).toContain('승인')
  })
})
