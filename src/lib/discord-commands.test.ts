import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_COMMAND_NAMES,
  COMMAND_KILLBOT_GUILD,
  COMMAND_WALLET,
  handleSlashCommand,
} from './discord-commands'
import { MESSAGE_FLAG_EPHEMERAL } from './discord-interactions'
import type { DiscordInteractionPayload } from './discord-interactions'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const eqStatus = vi.fn(() => ({ maybeSingle }))
  const eqGuild = vi.fn(() => ({ eq: eqStatus }))
  const select = vi.fn(() => ({ eq: eqGuild }))
  const from = vi.fn(() => ({ select }))
  return {
    maybeSingle,
    eqStatus,
    eqGuild,
    select,
    from,
  }
})

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
}))

describe('killbotguild slash command', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('returns the public killbot guide URL without requiring guild binding', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand({
      type: 2,
      data: {
        id: 'cmd-killbotguild',
        name: COMMAND_KILLBOT_GUILD,
        type: 1,
      },
      locale: 'ko',
    } as DiscordInteractionPayload)

    expect(ALL_COMMAND_NAMES).toContain(COMMAND_KILLBOT_GUILD)
    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('킬봇 운영 설명서')
    expect(response.data?.content).toContain(
      'https://albion-guildmanager.com/killbotguild.html',
    )
  })
})

describe('wallet slash command', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('returns the tenant wallet redirect URL for a linked Discord guild', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'tenant-1',
        slug: 'menhera',
        name: 'Menhera',
      },
    })

    const response = await handleSlashCommand({
      type: 2,
      guild_id: 'discord-guild-1',
      data: {
        id: 'cmd-wallet',
        name: COMMAND_WALLET,
        type: 1,
      },
      locale: 'ko',
    } as DiscordInteractionPayload)

    expect(ALL_COMMAND_NAMES).toContain(COMMAND_WALLET)
    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('내 지갑')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
    expect(mocks.from).toHaveBeenCalledWith('tenants')
    expect(mocks.eqGuild).toHaveBeenCalledWith('discord_guild_id', 'discord-guild-1')
    expect(mocks.eqStatus).toHaveBeenCalledWith('status', 'active')
  })

  it('keeps wallet links behind Discord guild context', async () => {
    const response = await handleSlashCommand({
      type: 2,
      data: {
        id: 'cmd-wallet',
        name: COMMAND_WALLET,
        type: 1,
      },
      locale: 'ko',
    } as DiscordInteractionPayload)

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('디스코드 서버 안에서만')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
