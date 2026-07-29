import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ALL_CAPABILITIES,
  CAP,
  hasCapability,
  resolveUserCapabilities,
} from './permissions'

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

let roleResult: QueryResult
let overrideResult: QueryResult

function createPermissionDb() {
  const roleChain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
  }
  roleChain.select.mockReturnValue(roleChain)
  roleChain.eq.mockReturnValue(roleChain)
  roleChain.in.mockImplementation(async () => roleResult)

  const overrideChain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn(),
  }
  overrideChain.select.mockReturnValue(overrideChain)
  overrideChain.eq.mockReturnValue(overrideChain)
  overrideChain.is.mockReturnValue(overrideChain)
  overrideChain.gt.mockReturnValue(overrideChain)
  overrideChain.maybeSingle.mockImplementation(async () => overrideResult)

  const from = vi.fn((table: string) => {
    if (table === 'permission_role_grants') return roleChain
    if (table === 'permission_user_overrides') return overrideChain
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    db: { from } as unknown as SupabaseClient,
    from,
    roleChain,
    overrideChain,
  }
}

const baseOptions = {
  guildId: 'tenant-1',
  discordId: '11111111111111111',
  discordRoleIds: ['22222222222222222', '33333333333333333'],
  isLegacyAdmin: false,
} as const

beforeEach(() => {
  roleResult = { data: [], error: null }
  overrideResult = { data: null, error: null }
})

describe('resolveUserCapabilities', () => {
  it('unions current Discord role grants, then applies one active user exception', async () => {
    roleResult = {
      data: [
        { capabilities: CAP.MEMBERS_VIEW.toString() },
        { capabilities: CAP.EVENT_MANAGE.toString() },
      ],
      error: null,
    }
    overrideResult = {
      data: {
        capabilities_granted: CAP.REGEAR_APPROVE.toString(),
        capabilities_revoked: CAP.MEMBERS_VIEW.toString(),
      },
      error: null,
    }
    const { db, roleChain, overrideChain } = createPermissionDb()

    const result = await resolveUserCapabilities(db, baseOptions)

    expect(result).toBe(CAP.EVENT_MANAGE | CAP.REGEAR_APPROVE)
    expect(roleChain.eq).toHaveBeenCalledWith('guild_id', 'tenant-1')
    expect(roleChain.in).toHaveBeenCalledWith(
      'discord_role_id',
      baseOptions.discordRoleIds,
    )
    expect(overrideChain.eq).toHaveBeenCalledWith('guild_id', 'tenant-1')
    expect(overrideChain.eq).toHaveBeenCalledWith(
      'discord_id',
      '11111111111111111',
    )
    expect(overrideChain.is).toHaveBeenCalledWith('revoked_at', null)
    expect(overrideChain.gt).toHaveBeenCalledWith(
      'expires_at',
      expect.stringMatching(/Z$/),
    )
  })

  it('expands the GUILD_ADMIN role marker to the complete capability bundle', async () => {
    roleResult = {
      data: [{ capabilities: CAP.GUILD_ADMIN.toString() }],
      error: null,
    }
    const { db } = createPermissionDb()

    await expect(resolveUserCapabilities(db, baseOptions)).resolves.toBe(
      ALL_CAPABILITIES,
    )
  })

  it('allows an emergency exception to demote a role-based full admin', async () => {
    roleResult = {
      data: [
        {
          capabilities: (
            CAP.GUILD_ADMIN |
            CAP.EVENT_MANAGE |
            CAP.MEMBERS_VIEW
          ).toString(),
        },
      ],
      error: null,
    }
    overrideResult = {
      data: {
        capabilities_granted: '0',
        capabilities_revoked: (
          CAP.GUILD_ADMIN |
          CAP.MEMBERS_VIEW
        ).toString(),
      },
      error: null,
    }
    const { db } = createPermissionDb()

    const result = await resolveUserCapabilities(db, baseOptions)

    expect(result).toBe(CAP.EVENT_MANAGE)
    expect(hasCapability(result, CAP.GUILD_ADMIN)).toBe(false)
    expect(hasCapability(result, CAP.SETTINGS_PERMISSIONS)).toBe(false)
  })

  it('does not let a user exception lock out the tenant owner/bootstrap admin', async () => {
    overrideResult = {
      data: {
        capabilities_granted: '0',
        capabilities_revoked: ALL_CAPABILITIES.toString(),
      },
      error: null,
    }
    const { db } = createPermissionDb()

    await expect(
      resolveUserCapabilities(db, {
        ...baseOptions,
        discordRoleIds: [],
        isLegacyAdmin: true,
      }),
    ).resolves.toBe(ALL_CAPABILITIES)
  })

  it('fails closed when either permission authority query fails', async () => {
    roleResult = { data: null, error: { message: 'role read failed' } }
    const first = createPermissionDb()
    await expect(
      resolveUserCapabilities(first.db, baseOptions),
    ).rejects.toThrow('role read failed')

    roleResult = { data: [], error: null }
    overrideResult = {
      data: null,
      error: { message: 'override read failed' },
    }
    const second = createPermissionDb()
    await expect(
      resolveUserCapabilities(second.db, baseOptions),
    ).rejects.toThrow('override read failed')
  })
})
