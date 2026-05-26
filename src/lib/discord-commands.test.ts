import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_COMMAND_NAMES,
  COMMAND_KILLBOT_GUILD,
  handleSlashCommand,
} from './discord-commands'
import { MESSAGE_FLAG_EPHEMERAL } from './discord-interactions'
import type { DiscordInteractionPayload } from './discord-interactions'

describe('killbotguild slash command', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
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
