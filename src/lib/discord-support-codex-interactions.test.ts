import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscordInteractionPayload } from '@/lib/discord-interactions'

const service = vi.hoisted(() => ({
  loadSupportCodexSettings: vi.fn(),
  listSupportCodexJobStatus: vi.fn(),
  listSupportCodexTickets: vi.fn(),
  approveSupportCodexJob: vi.fn(),
  cancelSupportCodexJob: vi.fn(),
  createSupportCodexJob: vi.fn(),
  loadSupportCodexJob: vi.fn(),
  retrySupportCodexJob: vi.fn(),
  syncSupportCodexJobMessage: vi.fn(),
}))

vi.mock('@/lib/support-codex-control-service', () => service)
vi.mock('@/lib/discord-support-ticket-core', async (loadOriginal) => {
  const original = await loadOriginal<typeof import('@/lib/discord-support-ticket-core')>()
  return { ...original, isSupportGuild: (guildId: string) => guildId === '823456789012345678' }
})

import { handleDiscordSupportCodexInteraction } from '@/lib/discord-support-codex-interactions'
import { supportCodexPanelCustomId } from '@/lib/support-codex-control-core'

function interaction(input: {
  actorId: string
  channelId?: string
  action?: 'analyze' | 'status'
}): DiscordInteractionPayload {
  return {
    id: '923456789012345678',
    application_id: '923456789012345679',
    token: 'interaction-token',
    type: 3,
    guild_id: '823456789012345678',
    channel_id: input.channelId ?? '723456789012345678',
    member: { user: { id: input.actorId, username: 'operator' } },
    data: { custom_id: supportCodexPanelCustomId(input.action ?? 'analyze') },
  } as DiscordInteractionPayload
}

describe('Discord support Codex authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SUPPORT_CODEX_ENABLED', 'true')
    vi.stubEnv('CODEX_WORKER_SECRET', 'x'.repeat(32))
    service.loadSupportCodexSettings.mockResolvedValue({
      supportGuildId: '823456789012345678',
      channelId: '723456789012345678',
      panelMessageId: '623456789012345678',
    })
    service.listSupportCodexTickets.mockResolvedValue([])
    service.listSupportCodexJobStatus.mockResolvedValue('No jobs.')
  })

  it('rejects every non-owner before reading settings or jobs', async () => {
    const response = await handleDiscordSupportCodexInteraction(interaction({
      actorId: '490294888605155338',
    }))

    expect(response.data?.flags).toBe(1 << 6)
    expect(service.loadSupportCodexSettings).not.toHaveBeenCalled()
    expect(service.listSupportCodexTickets).not.toHaveBeenCalled()
  })

  it('rejects the owner outside the configured private channel', async () => {
    const response = await handleDiscordSupportCodexInteraction(interaction({
      actorId: '490294888605155339',
      channelId: '723456789012345679',
    }))

    expect(response.data?.flags).toBe(1 << 6)
    expect(service.listSupportCodexTickets).not.toHaveBeenCalled()
  })

  it('allows the owner to read status in the configured channel', async () => {
    await handleDiscordSupportCodexInteraction(interaction({
      actorId: '490294888605155339',
      action: 'status',
    }))

    expect(service.listSupportCodexJobStatus).toHaveBeenCalledWith('823456789012345678')
  })

  it('keeps new work disabled until the signed worker secret is configured', async () => {
    vi.stubEnv('CODEX_WORKER_SECRET', '')
    const response = await handleDiscordSupportCodexInteraction(interaction({
      actorId: '490294888605155339',
      action: 'analyze',
    }))

    expect(response.data?.content).toContain('비활성화')
    expect(service.listSupportCodexTickets).not.toHaveBeenCalled()
  })

  it('keeps status available but blocks new work when the kill switch is off', async () => {
    vi.stubEnv('SUPPORT_CODEX_ENABLED', 'false')
    const response = await handleDiscordSupportCodexInteraction(interaction({
      actorId: '490294888605155339',
      action: 'analyze',
    }))

    expect(response.data?.content).toContain('비활성화')
    expect(service.listSupportCodexTickets).not.toHaveBeenCalled()
  })
})
