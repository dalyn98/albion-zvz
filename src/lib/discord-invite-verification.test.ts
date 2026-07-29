import { describe, expect, it, vi } from 'vitest'
import { verifyDiscordInviteForGuild } from './discord-invite-verification'

describe('verifyDiscordInviteForGuild', () => {
  it('accepts only an invite whose guild matches the bot installation tenant', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ guild: { id: 'discord-guild-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      verifyDiscordInviteForGuild(
        'https://discord.com/invite/Demo_123?utm=copy',
        'discord-guild-1',
        request,
      ),
    ).resolves.toEqual({
      status: 'verified',
      canonicalUrl: 'https://discord.gg/Demo_123',
      discordGuildId: 'discord-guild-1',
    })
    expect(request).toHaveBeenCalledWith(
      'https://discord.com/api/v10/invites/Demo_123?with_counts=false',
      expect.objectContaining({
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      }),
    )
  })

  it('rejects a valid invite for another Discord guild', async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ guild: { id: 'discord-guild-2' } }), {
        status: 200,
      }),
    )

    await expect(
      verifyDiscordInviteForGuild(
        'https://discord.gg/demo',
        'discord-guild-1',
        request,
      ),
    ).resolves.toEqual({
      status: 'wrong_guild',
      discordGuildId: 'discord-guild-2',
    })
  })

  it('fails closed for expired, non-guild, and malformed invites', async () => {
    const notFound = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    await expect(
      verifyDiscordInviteForGuild(
        'https://discord.gg/expired',
        'discord-guild-1',
        notFound,
      ),
    ).resolves.toEqual({ status: 'invalid' })

    const noGuild = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'group-dm' }), { status: 200 }),
    )
    await expect(
      verifyDiscordInviteForGuild(
        'https://discord.gg/group-dm',
        'discord-guild-1',
        noGuild,
      ),
    ).resolves.toEqual({ status: 'invalid' })

    await expect(
      verifyDiscordInviteForGuild(
        'https://discord.gg.evil.test/demo',
        'discord-guild-1',
        vi.fn(),
      ),
    ).resolves.toEqual({ status: 'invalid' })
  })

  it('keeps transient Discord failures distinct so callers do not overwrite settings', async () => {
    const rateLimited = vi.fn().mockResolvedValue(new Response(null, { status: 429 }))
    await expect(
      verifyDiscordInviteForGuild(
        'https://discord.gg/demo',
        'discord-guild-1',
        rateLimited,
      ),
    ).resolves.toEqual({ status: 'unavailable' })

    const networkFailure = vi.fn().mockRejectedValue(new Error('network down'))
    await expect(
      verifyDiscordInviteForGuild(
        'https://discord.gg/demo',
        'discord-guild-1',
        networkFailure,
      ),
    ).resolves.toEqual({ status: 'unavailable' })
  })
})
