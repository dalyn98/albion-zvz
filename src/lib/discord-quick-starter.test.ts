import { describe, expect, it } from 'vitest'
import { buildDiscordQuickStarterComponents } from './discord-quick-starter'

describe('buildDiscordQuickStarterComponents', () => {
  it('binds every protected feature to a destination-specific app login interaction', () => {
    const components = buildDiscordQuickStarterComponents({
      discordGuildId: 'discord-guild-1',
      labels: {
        login: 'Discord Login',
        verify: 'Verify',
        events: 'Events',
        me: 'My Page',
        regear: 'Regear',
        shop: 'Shop',
        wallet: 'Wallet',
        craft: 'Craft',
        guide: 'Guide',
      },
    })

    const buttons = components.flatMap((row) => row.components as unknown as Array<{
      type: number
      style?: number
      label?: string
      custom_id?: string
      url?: string
    }>)
    expect(components).toHaveLength(3)
    expect(buttons).toHaveLength(9)
    expect(buttons[0]).toMatchObject({
      type: 2,
      style: 2,
      label: 'Verify',
      custom_id: 'agm_login:v1:verify',
    })
    expect(buttons[6]).toMatchObject({
      type: 2,
      style: 2,
      label: 'Wallet',
      custom_id: 'agm_login:v1:wallet',
    })
    expect(buttons.slice(0, 8).filter((button) => button.label !== 'Guide').every((button) => (
      button.style === 2 && !!button.custom_id && !button.url
    ))).toBe(true)
    expect(buttons[3]).toMatchObject({
      type: 2,
      style: 5,
      label: 'Guide',
      url: 'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=guide',
    })
    expect(buttons[3]?.custom_id).toBeUndefined()
    expect(buttons[8]).toMatchObject({
      type: 2,
      style: 3,
      label: 'Discord Login',
      custom_id: 'agm_login:v1:me',
    })
    expect(buttons[8]?.url).toBeUndefined()
  })
})
