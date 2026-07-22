import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createDiscordAppLoginLink: vi.fn(async () => 'https://guild.example/api/auth/discord/app/consume?id=attempt&token=secret'),
}))

vi.mock('@/lib/discord-app-login', () => ({
  createDiscordAppLoginLink: mocks.createDiscordAppLoginLink,
}))

import { webButton } from './discord-command-suite-shared'

describe('Discord command web buttons', () => {
  it('binds protected web destinations to the invoking Discord actor', async () => {
    const components = await webButton({
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'guild',
      name: 'Guild',
      createdByDiscordId: null,
      adminRoleIds: [],
    }, '123456789012345678', '/me/wallet', 'Open')

    expect(mocks.createDiscordAppLoginLink).toHaveBeenCalledWith({
      guildId: '11111111-1111-4111-8111-111111111111',
      tenantSlug: 'guild',
      discordId: '123456789012345678',
      returnTo: '/me/wallet',
    })
    expect(components[0]?.components[0]).toMatchObject({
      style: 5,
      url: 'https://guild.example/api/auth/discord/app/consume?id=attempt&token=secret',
    })
  })
})
