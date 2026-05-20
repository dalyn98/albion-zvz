import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionPayload } from './session'

const getSessionMock = vi.fn<() => Promise<SessionPayload | null>>()
const getSessionGuildIdMock = vi.fn<(s: SessionPayload) => Promise<string | null>>()

vi.mock('@/lib/session', () => ({
  getSession: () => getSessionMock(),
  sessionHas: (s: SessionPayload | null, cap: bigint) => {
    if (!s) return false
    return (BigInt(s.capabilities) & cap) !== 0n
  },
}))
vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: (s: SessionPayload) => getSessionGuildIdMock(s),
}))

// `requireAdmin` etc. return the admin client unmodified — we just want a
// stable sentinel value so tests can assert "returned the right client".
const ADMIN_SENTINEL = { __sentinel: 'admin-client' }
type Eq = { column: string; value: unknown }
const eqRecorder: Array<Eq[]> = []
let activeEqChain: Eq[] = []

interface QueryResult {
  data: unknown
  error: { message: string } | null
}
let nextEventResult: QueryResult = { data: null, error: null }
let nextPartyResult: QueryResult = { data: null, error: null }
let nextSlotResult: QueryResult = { data: null, error: null }

function makeChain(resultRef: () => QueryResult) {
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      activeEqChain.push({ column, value })
      return chain
    },
    maybeSingle: async () => resultRef(),
  }
  return chain
}

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({
    ...ADMIN_SENTINEL,
    from: (table: string) => {
      activeEqChain = []
      eqRecorder.push(activeEqChain)
      if (table === 'events') return makeChain(() => nextEventResult)
      if (table === 'parties') return makeChain(() => nextPartyResult)
      if (table === 'slots') return makeChain(() => nextSlotResult)
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

import {
  requireAdmin,
  requireCapability,
  requireEventCreator,
  requireEventCreatorForEvent,
  requireEventCreatorOrPartyCaller,
  requireEventCreatorForSlot,
} from './auth'

const session = (overrides: Partial<SessionPayload> = {}): SessionPayload => ({
  discordId: 'user-1',
  username: 'tester',
  avatar: null,
  isMember: true,
  isAdmin: false,
  isGuest: false,
  canCreateEvents: false,
  eventCreatorCategories: [],
  eventScope: null,
  guildId: 'tenant-1',
  capabilities: '0',
  issuedAt: Date.now(),
  ...overrides,
} as unknown as SessionPayload)

beforeEach(() => {
  getSessionMock.mockReset()
  getSessionGuildIdMock.mockReset().mockResolvedValue('tenant-1')
  eqRecorder.length = 0
  nextEventResult = { data: null, error: null }
  nextPartyResult = { data: null, error: null }
  nextSlotResult = { data: null, error: null }
})

describe('requireAdmin', () => {
  it('throws Unauthorized when no session', async () => {
    getSessionMock.mockResolvedValue(null)
    await expect(requireAdmin()).rejects.toThrow(/Unauthorized/)
  })
  it('throws when session is not admin', async () => {
    getSessionMock.mockResolvedValue(session({ isAdmin: false }))
    await expect(requireAdmin()).rejects.toThrow(/Unauthorized/)
  })
  it('returns admin client when isAdmin', async () => {
    getSessionMock.mockResolvedValue(session({ isAdmin: true }))
    const c = await requireAdmin()
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })
})

describe('requireCapability', () => {
  const cap = 1n << 27n

  it('throws Unauthorized when capability is missing', async () => {
    getSessionMock.mockResolvedValue(session({ capabilities: '0' }))
    await expect(requireCapability(cap)).rejects.toThrow(/Unauthorized/)
  })

  it('returns admin client when capability is present', async () => {
    getSessionMock.mockResolvedValue(session({ capabilities: cap.toString() }))
    const c = await requireCapability(cap)
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })

  it('keeps legacy admins working even if their cookie lacks a new capability bit', async () => {
    getSessionMock.mockResolvedValue(session({ isAdmin: true, capabilities: '0' }))
    const c = await requireCapability(cap)
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })
})

describe('requireEventCreator', () => {
  it('throws when not canCreateEvents', async () => {
    getSessionMock.mockResolvedValue(session({ canCreateEvents: false }))
    await expect(requireEventCreator()).rejects.toThrow(/Unauthorized/)
  })
  it('passes when canCreateEvents (even non-admin)', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: true, isAdmin: false }),
    )
    const c = await requireEventCreator()
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })
})

describe('requireEventCreatorForEvent', () => {
  it('admin bypasses ownership check', async () => {
    getSessionMock.mockResolvedValue(session({ isAdmin: true }))
    const c = await requireEventCreatorForEvent('evt-1')
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })

  it('throws when no session', async () => {
    getSessionMock.mockResolvedValue(null)
    await expect(requireEventCreatorForEvent('evt-1')).rejects.toThrow(/Unauthorized/)
  })

  it('non-admin without canCreateEvents is blocked', async () => {
    getSessionMock.mockResolvedValue(session({ canCreateEvents: false }))
    await expect(requireEventCreatorForEvent('evt-1')).rejects.toThrow(/Unauthorized/)
  })

  it('owner passes (created_by matches discordId)', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: true, discordId: 'owner-1' }),
    )
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    const c = await requireEventCreatorForEvent('evt-1')
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })

  it('non-owner blocked even with canCreateEvents', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: true, discordId: 'rando' }),
    )
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    await expect(requireEventCreatorForEvent('evt-1')).rejects.toThrow(/Unauthorized/)
  })

  it('legacy events with null created_by stay admin-only', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: true, discordId: 'owner-1' }),
    )
    nextEventResult = { data: { created_by: null }, error: null }
    await expect(requireEventCreatorForEvent('evt-1')).rejects.toThrow(/Unauthorized/)
  })

  it('throws Event not found when event is missing', async () => {
    getSessionMock.mockResolvedValue(session({ canCreateEvents: true }))
    nextEventResult = { data: null, error: null }
    await expect(requireEventCreatorForEvent('evt-1')).rejects.toThrow(/Event not found/)
  })

  it('scopes lookup by guildId (tenant isolation)', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: true, discordId: 'owner-1', guildId: 'tenant-XYZ' }),
    )
    getSessionGuildIdMock.mockResolvedValue('tenant-XYZ')
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    await requireEventCreatorForEvent('evt-1')
    expect(eqRecorder[0]).toContainEqual({ column: 'guild_id', value: 'tenant-XYZ' })
  })
})

describe('requireEventCreatorOrPartyCaller', () => {
  it('admin gets isAdminOrOwner=true without lookup', async () => {
    getSessionMock.mockResolvedValue(session({ isAdmin: true }))
    const r = await requireEventCreatorOrPartyCaller('evt-1', 'p-1')
    expect(r.isAdminOrOwner).toBe(true)
  })

  it('event owner gets isAdminOrOwner=true', async () => {
    getSessionMock.mockResolvedValue(session({ discordId: 'owner-1' }))
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    const r = await requireEventCreatorOrPartyCaller('evt-1', 'p-1')
    expect(r.isAdminOrOwner).toBe(true)
  })

  it('party caller passes with isAdminOrOwner=false', async () => {
    getSessionMock.mockResolvedValue(session({ discordId: 'caller-1' }))
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    nextPartyResult = {
      data: { event_id: 'evt-1', caller_discord_id: 'caller-1' },
      error: null,
    }
    const r = await requireEventCreatorOrPartyCaller('evt-1', 'p-1')
    expect(r.isAdminOrOwner).toBe(false)
  })

  it('rejects when partyId is null and caller is not admin/owner', async () => {
    getSessionMock.mockResolvedValue(session({ discordId: 'rando' }))
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    await expect(
      requireEventCreatorOrPartyCaller('evt-1', null),
    ).rejects.toThrow(/Unauthorized/)
  })

  it('rejects when party caller is someone else', async () => {
    getSessionMock.mockResolvedValue(session({ discordId: 'rando' }))
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    nextPartyResult = {
      data: { event_id: 'evt-1', caller_discord_id: 'caller-1' },
      error: null,
    }
    await expect(
      requireEventCreatorOrPartyCaller('evt-1', 'p-1'),
    ).rejects.toThrow(/Unauthorized/)
  })

  it('rejects when party belongs to a different event', async () => {
    getSessionMock.mockResolvedValue(session({ discordId: 'caller-1' }))
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    nextPartyResult = {
      data: { event_id: 'evt-other', caller_discord_id: 'caller-1' },
      error: null,
    }
    await expect(
      requireEventCreatorOrPartyCaller('evt-1', 'p-1'),
    ).rejects.toThrow(/Unauthorized/)
  })
})

describe('requireEventCreatorForSlot', () => {
  it('admin bypasses', async () => {
    getSessionMock.mockResolvedValue(session({ isAdmin: true }))
    const c = await requireEventCreatorForSlot('slot-1')
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })

  it('throws when no session', async () => {
    getSessionMock.mockResolvedValue(null)
    await expect(requireEventCreatorForSlot('slot-1')).rejects.toThrow(/Unauthorized/)
  })

  it('non-admin without canCreateEvents blocked', async () => {
    getSessionMock.mockResolvedValue(session({ canCreateEvents: false }))
    await expect(requireEventCreatorForSlot('slot-1')).rejects.toThrow(/Unauthorized/)
  })

  it('owner of the joined event passes', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: true, discordId: 'owner-1' }),
    )
    nextSlotResult = {
      data: { parties: { events: { created_by: 'owner-1' } } },
      error: null,
    }
    const c = await requireEventCreatorForSlot('slot-1')
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })

  it('non-owner of joined event blocked', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: true, discordId: 'rando' }),
    )
    nextSlotResult = {
      data: { parties: { events: { created_by: 'owner-1' } } },
      error: null,
    }
    await expect(requireEventCreatorForSlot('slot-1')).rejects.toThrow(/Unauthorized/)
  })

  it('handles parties/events arrays from Supabase nested-array shape', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: true, discordId: 'owner-1' }),
    )
    nextSlotResult = {
      data: { parties: [{ events: [{ created_by: 'owner-1' }] }] },
      error: null,
    }
    const c = await requireEventCreatorForSlot('slot-1')
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })

  it('blocks when created_by is null (legacy slot)', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: true, discordId: 'owner-1' }),
    )
    nextSlotResult = {
      data: { parties: { events: { created_by: null } } },
      error: null,
    }
    await expect(requireEventCreatorForSlot('slot-1')).rejects.toThrow(/Unauthorized/)
  })
})
