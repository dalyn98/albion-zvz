import { beforeEach, describe, expect, it, vi } from 'vitest'
import { removeGuestRecordForMember } from './guest-membership-transition'

const mocks = vi.hoisted(() => ({
  logWarn: vi.fn(),
}))

vi.mock('@/lib/log', () => ({
  log: {
    warn: mocks.logWarn,
  },
}))

function createDb(error: { message: string } | null = null) {
  let eqCallCount = 0
  const chain = {
    delete: vi.fn(() => chain),
    eq: vi.fn((_: string, __: string) => {
      eqCallCount += 1
      if (eqCallCount >= 2) return Promise.resolve({ error })
      return chain
    }),
  }
  return {
    chain,
    db: {
      from: vi.fn(() => chain),
    },
  }
}

describe('removeGuestRecordForMember', () => {
  beforeEach(() => {
    mocks.logWarn.mockReset()
  })

  it('removes only the matching guest row inside the current guild', async () => {
    const { db, chain } = createDb()

    await expect(
      removeGuestRecordForMember(db as never, {
        guildId: 'guild-1',
        discordId: 'discord-1',
        source: 'member_login',
      }),
    ).resolves.toEqual({ ok: true })

    expect(db.from).toHaveBeenCalledWith('guests')
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(chain.eq).toHaveBeenCalledWith('discord_id', 'discord-1')
    expect(mocks.logWarn).not.toHaveBeenCalled()
  })

  it('keeps the caller flow best-effort when guest cleanup fails', async () => {
    const { db } = createDb({ message: 'delete failed' })

    await expect(
      removeGuestRecordForMember(db as never, {
        guildId: 'guild-1',
        discordId: 'discord-1',
        source: 'albion_trusted',
      }),
    ).resolves.toEqual({ ok: false })

    expect(mocks.logWarn).toHaveBeenCalledWith(
      '[guest-membership-transition] cleanup failed',
      expect.objectContaining({
        guild_id: 'guild-1',
        discord_id: 'discord-1',
        source: 'albion_trusted',
        error: 'delete failed',
      }),
    )
  })
})
