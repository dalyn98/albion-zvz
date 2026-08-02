import { describe, expect, it } from 'vitest'
import { buildDiscordQuickStarterComponents } from './discord-quick-starter'

describe('buildDiscordQuickStarterComponents', () => {
  it('opens features directly and reserves app login for session refresh', () => {
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
      style: 5,
      label: 'Verify',
      url: 'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=verify',
    })
    expect(buttons[6]).toMatchObject({
      type: 2,
      style: 5,
      label: 'Wallet',
      url: 'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=wallet',
    })
    expect(buttons.slice(0, 8).every((button) => (
      button.style === 5 && !!button.url && !button.custom_id
    ))).toBe(true)
    expect(buttons[8]).toMatchObject({
      type: 2,
      style: 3,
      label: 'Discord Login',
      custom_id: 'agm_login:v1:me',
    })
    expect(buttons[8]?.url).toBeUndefined()
  })

  it('omits disabled feature destinations while preserving core actions and login', () => {
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
      destinations: ['verify', 'events', 'me', 'guide'],
    })
    const labels = components.flatMap((row) => row.components as unknown as Array<{
      label?: string
    }>).map((button) => button.label)

    expect(components).toHaveLength(2)
    expect(labels).toEqual(['Verify', 'Events', 'My Page', 'Guide', 'Discord Login'])
    expect(labels).not.toContain('Shop')
    expect(labels).not.toContain('Regear')
  })
})
