import { describe, expect, it } from 'vitest'
import {
  DISCORD_CHANNEL_CATALOG,
  listDiscordChannelCatalog,
} from './discord-channel-catalog'
import { AGM_COMMAND_PATHS } from './discord-command-suite-shared'

describe('Discord channel catalog', () => {
  it('classifies every published AGM command exactly once', () => {
    expect(Object.keys(DISCORD_CHANNEL_CATALOG).sort()).toEqual(
      [...AGM_COMMAND_PATHS].sort(),
    )
    expect(listDiscordChannelCatalog()).toHaveLength(AGM_COMMAND_PATHS.length)
  })

  it('requires expiring confirmation for the four stateful quick-execution families', () => {
    expect(
      listDiscordChannelCatalog('discord-confirmed-action').map(({ path }) => path),
    ).toEqual([
      'wallet.send',
      'craft.deliver',
      'shop.order',
      'shop.reorder',
      'admin.event-start',
    ])
  })

  it('keeps complex policy and exception handling on the web', () => {
    expect(DISCORD_CHANNEL_CATALOG['me.verify'].mode).toBe('web-workflow')
    expect(DISCORD_CHANNEL_CATALOG['regear.eligible'].mode).toBe('web-workflow')
    expect(DISCORD_CHANNEL_CATALOG['admin.dashboard'].mode).toBe('web-workflow')
  })

  it('treats a browser login approval as an explicit one-time action', () => {
    expect(DISCORD_CHANNEL_CATALOG.login).toEqual(
      expect.objectContaining({
        mode: 'discord-simple-action',
        mutation: true,
        webPath: '/login',
      }),
    )
  })
})
