import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_COMMAND_NAMES,
  COMMAND_AGM,
  handleSlashCommand,
} from './discord-commands'
import { MESSAGE_FLAG_EPHEMERAL } from './discord-interactions'
import type { DiscordInteractionPayload } from './discord-interactions'

const mocks = vi.hoisted(() => {
  const tenantMaybeSingle = vi.fn()
  const tenantEqStatus = vi.fn(() => ({ maybeSingle: tenantMaybeSingle }))
  const tenantEqGuild = vi.fn(() => ({ eq: tenantEqStatus }))
  const tenantSelect = vi.fn(() => ({ eq: tenantEqGuild }))

  const eventMaybeSingle = vi.fn()
  const eventLimit = vi.fn(() => ({ maybeSingle: eventMaybeSingle }))
  const eventOrder = vi.fn(() => ({ limit: eventLimit }))
  const eventGte = vi.fn(() => ({ order: eventOrder }))
  const eventBattleStarted = vi.fn(() => ({ gte: eventGte }))
  const eventStatus = vi.fn(() => ({ is: eventBattleStarted }))
  const eventGuild = vi.fn(() => ({ eq: eventStatus }))
  const eventSelect = vi.fn(() => ({ eq: eventGuild }))

  const from = vi.fn((table: string) => {
    if (table === 'tenants') return { select: tenantSelect }
    if (table === 'events') return { select: eventSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    eventBattleStarted,
    eventGte,
    eventGuild,
    eventMaybeSingle,
    eventOrder,
    eventStatus,
    from,
    tenantEqGuild,
    tenantEqStatus,
    tenantMaybeSingle,
  }
})

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
}))

function agmPayload(subcommand: string, overrides: Partial<DiscordInteractionPayload> = {}) {
  return {
    id: 'interaction-1',
    type: 2,
    guild_id: 'discord-guild-1',
    data: {
      id: 'cmd-agm',
      name: COMMAND_AGM,
      type: 1,
      options: [{ name: subcommand, type: 1 }],
    },
    locale: 'ko',
    ...overrides,
  } as DiscordInteractionPayload
}

function mockTenant() {
  mocks.tenantMaybeSingle.mockResolvedValueOnce({
    data: {
      id: 'tenant-1',
      slug: 'menhera',
      name: 'Menhera',
    },
  })
}

describe('agm slash command navigation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('registers only the agm command name in code', () => {
    expect(ALL_COMMAND_NAMES).toEqual([COMMAND_AGM])
  })

  it('does not keep the legacy direct wallet command as a valid command', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand({
      id: 'interaction-1',
      type: 2,
      guild_id: 'discord-guild-1',
      data: {
        id: 'cmd-wallet',
        name: 'wallet',
        type: 1,
      },
      locale: 'ko',
    } as DiscordInteractionPayload)

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('/agm')
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('routes /agm wallet to the tenant wallet entry point', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmPayload('wallet'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('내 지갑')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
    expect(mocks.from).toHaveBeenCalledWith('tenants')
    expect(mocks.tenantEqGuild).toHaveBeenCalledWith('discord_guild_id', 'discord-guild-1')
    expect(mocks.tenantEqStatus).toHaveBeenCalledWith('status', 'active')
  })

  it('routes /agm verify to the tenant Albion onboarding entry point', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmPayload('verify'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('Albion 인증')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/onboarding/albion',
    )
  })

  it('routes /agm events to the events list and the next event when one exists', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.eventMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'event-1',
        title: 'CTA',
        gather_at: '2026-05-29T12:00:00.000Z',
      },
    })

    const response = await handleSlashCommand(agmPayload('events'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('이벤트')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/events',
    )
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/events/event-1',
    )
    expect(mocks.eventGuild).toHaveBeenCalledWith('guild_id', 'tenant-1')
  })

  it('shows only the public guide links for /agm guide without a guild context', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand(agmPayload('guide', { guild_id: undefined }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('사용법')
    expect(response.data?.content).toContain(
      'https://albion-guildmanager.com/member-quick-guide.html',
    )
    expect(response.data?.content).toContain('https://albion-guildmanager.com/faq')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
