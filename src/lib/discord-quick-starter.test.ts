import { describe, expect, it } from 'vitest'
import { buildDiscordQuickStarterComponents } from './discord-quick-starter'

describe('buildDiscordQuickStarterComponents', () => {
  it('uses signed Discord component interactions instead of static browser OAuth links', () => {
    const components = buildDiscordQuickStarterComponents({
      discordGuildId: 'discord-guild-1',
      labels: {
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
    expect(buttons).toHaveLength(8)
    expect(buttons[0]).toMatchObject({
      type: 2,
      style: 1,
      label: 'Verify',
      custom_id: 'agm_login:v1:verify',
    })
    expect(buttons[6]).toMatchObject({
      type: 2,
      style: 1,
      label: 'Wallet',
      custom_id: 'agm_login:v1:wallet',
    })
    expect(buttons.every((button) => button.style !== 5 && !button.url)).toBe(true)
  })
})
