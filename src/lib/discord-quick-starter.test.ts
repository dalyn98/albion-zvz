import { describe, expect, it } from 'vitest'
import {
  buildDiscordQuickStarterComponents,
  buildDiscordQuickStarterMessagePayload,
} from './discord-quick-starter'
import type { DiscordQuickStarterButtonLabels } from './discord-quick-starter-config'

const labels: DiscordQuickStarterButtonLabels = {
  login: 'Discord Login',
  verify: 'Verify',
  events: 'Join Event',
  me: 'My Page',
  regear: 'Request Regear',
  shop: 'Shop',
  wallet: 'Exchange Points',
  craft: 'Craft',
  guide: 'Guide',
  eventsDescription: 'Choose an event and role.',
  exchangeDescription: 'Request a silver payout.',
  regearDescription: 'Open the protected request flow.',
}

describe('Discord Components V2 member panel', () => {
  it('renders three focused member workflows and a private login action', () => {
    const components = buildDiscordQuickStarterComponents({
      discordGuildId: 'discord-guild-1',
      labels,
    })

    expect(components).toHaveLength(1)
    expect(components[0]).toMatchObject({
      type: 17,
      components: [
        expect.objectContaining({
          type: 9,
          accessory: expect.objectContaining({
            type: 2,
            style: 1,
            label: 'Join Event',
            emoji: { name: '📅' },
            custom_id: 'agm_member:v1:event',
          }),
        }),
        expect.objectContaining({
          type: 9,
          accessory: expect.objectContaining({
            style: 1,
            label: 'Exchange Points',
            emoji: { name: '💱' },
            custom_id: 'agm_member:v1:exchange',
          }),
        }),
        expect.objectContaining({
          type: 9,
          accessory: expect.objectContaining({
            style: 1,
            label: 'Request Regear',
            emoji: { name: '🛡️' },
            custom_id: 'agm_member:v1:regear',
          }),
        }),
        expect.objectContaining({ type: 14 }),
        expect.objectContaining({
          type: 1,
          components: [expect.objectContaining({
            label: 'Discord Login',
            custom_id: 'agm_login:v1:me',
          })],
        }),
      ],
    })
  })

  it('omits unavailable economy and regear workflows', () => {
    const components = buildDiscordQuickStarterComponents({
      discordGuildId: 'discord-guild-1',
      labels,
      destinations: ['verify', 'events', 'me', 'guide'],
    })
    const container = components[0]
    expect(container?.type).toBe(17)
    const serialized = JSON.stringify(container)

    expect(serialized).toContain('agm_member:v1:event')
    expect(serialized).not.toContain('agm_member:v1:exchange')
    expect(serialized).not.toContain('agm_member:v1:regear')
    expect(serialized).toContain('agm_login:v1:me')
  })

  it('publishes a Components V2 payload without legacy content or embeds', () => {
    const payload = buildDiscordQuickStarterMessagePayload({
      discordGuildId: 'discord-guild-1',
      tenantName: 'Menhera',
      titleTemplate: '{name} Member Center',
      descriptionTemplate: 'Choose a workflow below.',
      color: '#2f80ed',
      footerTemplate: 'Albion Guild Manager',
      labels,
    })

    expect(payload).toMatchObject({
      content: null,
      embeds: [],
      flags: 1 << 15,
      allowed_mentions: { parse: [] },
    })
    expect(payload.components?.[0]).toMatchObject({
      type: 17,
      accent_color: 0x2f80ed,
      components: expect.arrayContaining([
        { type: 10, content: '## Menhera Member Center' },
        { type: 10, content: 'Choose a workflow below.' },
        expect.objectContaining({ type: 14 }),
      ]),
    })
    expect(JSON.stringify(payload)).not.toContain('discord-guild-1')
  })
})
