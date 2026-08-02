import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SessionPayload } from './session'
import { CAP } from '@/lib/permissions'

const getSessionMock = vi.fn<() => Promise<SessionPayload | null>>()
const getSessionGuildIdMock = vi.fn<(s: SessionPayload) => Promise<string | null>>()
const resolveLiveAuthorizationMock = vi.fn<
  (s: SessionPayload) => Promise<{ session: SessionPayload } | null>
>()
const assertSupportViewMutationAllowedMock = vi.fn<(s: SessionPayload) => Promise<void>>()

vi.mock('@/lib/session', () => ({
  getSession: () => getSessionMock(),
  sessionHas: (s: SessionPayload | null, cap: bigint) => {
    if (!s) return false
    if (s.isAdmin) return true
    return (BigInt(s.capabilities) & cap) !== 0n
  },
}))
vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: (s: SessionPayload) => getSessionGuildIdMock(s),
}))
vi.mock('@/lib/discord-live-authorization', () => ({
  resolveLiveDiscordAuthorization: (s: SessionPayload) =>
    resolveLiveAuthorizationMock(s),
}))
vi.mock('@/lib/support-view', () => ({
  assertSupportViewMutationAllowed: (s: SessionPayload) =>
    assertSupportViewMutationAllowedMock(s),
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
  requireLiveSession,
  requireCurrentMutationSession,
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
  isBombSquadCaller: false,
  isLocalGuildAccount: false,
  isAllianceCandidate: false,
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
  resolveLiveAuthorizationMock
    .mockReset()
    .mockImplementation(async (signedSession) => ({ session: signedSession }))
  assertSupportViewMutationAllowedMock.mockReset().mockResolvedValue(undefined)
  getSessionGuildIdMock.mockReset().mockResolvedValue('tenant-1')
  eqRecorder.length = 0
  nextEventResult = { data: null, error: null }
  nextPartyResult = { data: null, error: null }
  nextSlotResult = { data: null, error: null }
})

describe('requireLiveSession', () => {
  it('rejects a signed session when the user is no longer in Discord', async () => {
    getSessionMock.mockResolvedValue(session({ isAdmin: true }))
    resolveLiveAuthorizationMock.mockResolvedValue(null)

    await expect(requireLiveSession()).rejects.toThrow(/Unauthorized/)
  })

  it('returns the freshly recomputed role state, not the signed cookie state', async () => {
    const signed = session({ isAdmin: true, capabilities: CAP.GUILD_ADMIN.toString() })
    const live = session({ isAdmin: false, capabilities: CAP.MEMBERS_VIEW.toString() })
    getSessionMock.mockResolvedValue(signed)
    resolveLiveAuthorizationMock.mockResolvedValue({ session: live })

    await expect(requireLiveSession()).resolves.toEqual(live)
  })
})

describe('requireCurrentMutationSession', () => {
  it('refreshes ordinary Discord members before allowing a mutation', async () => {
    const signed = session({ username: 'stale-name' })
    const live = session({ username: 'live-name' })
    getSessionMock.mockResolvedValue(signed)
    resolveLiveAuthorizationMock.mockResolvedValue({ session: live })

    await expect(requireCurrentMutationSession()).resolves.toEqual(live)
    expect(resolveLiveAuthorizationMock).toHaveBeenCalledWith(signed)
    expect(assertSupportViewMutationAllowedMock).toHaveBeenCalledWith(signed)
  })

  it('rejects a member who has left the Discord guild', async () => {
    getSessionMock.mockResolvedValue(session())
    resolveLiveAuthorizationMock.mockResolvedValue(null)

    await expect(requireCurrentMutationSession()).rejects.toThrow(/Unauthorized/)
  })

  it.each([
    { isGuest: true, isMember: false },
    { isLocalGuildAccount: true },
  ])('keeps a current scoped non-Discord session usable', async (overrides) => {
    const scoped = session(overrides)
    getSessionMock.mockResolvedValue(scoped)

    await expect(requireCurrentMutationSession()).resolves.toEqual(scoped)
    expect(resolveLiveAuthorizationMock).not.toHaveBeenCalled()
    expect(assertSupportViewMutationAllowedMock).toHaveBeenCalledWith(scoped)
  })

  it('blocks support impersonation for every actor kind', async () => {
    getSessionMock.mockResolvedValue(session({ isLocalGuildAccount: true }))
    assertSupportViewMutationAllowedMock.mockRejectedValue(
      new Error('SUPPORT_VIEW_READ_ONLY'),
    )

    await expect(requireCurrentMutationSession()).rejects.toThrow(
      'SUPPORT_VIEW_READ_ONLY',
    )
  })
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
    expect(assertSupportViewMutationAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({ discordId: 'user-1' }),
    )
  })

  it('rejects every shared mutation gate while support view is read-only', async () => {
    getSessionMock.mockResolvedValue(session({ isAdmin: true }))
    assertSupportViewMutationAllowedMock.mockRejectedValue(
      new Error('SUPPORT_VIEW_READ_ONLY'),
    )

    await expect(requireAdmin()).rejects.toThrow('SUPPORT_VIEW_READ_ONLY')
  })

  it('rejects a stale admin cookie after the Discord role is removed', async () => {
    getSessionMock.mockResolvedValue(session({ isAdmin: true }))
    resolveLiveAuthorizationMock.mockResolvedValue({
      session: session({ isAdmin: false, capabilities: '0' }),
    })

    await expect(requireAdmin()).rejects.toThrow(/Unauthorized/)
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

  it('rejects a stale delegated capability removed from the Discord role mapping', async () => {
    getSessionMock.mockResolvedValue(session({ capabilities: cap.toString() }))
    resolveLiveAuthorizationMock.mockResolvedValue({
      session: session({ capabilities: '0' }),
    })

    await expect(requireCapability(cap)).rejects.toThrow(/Unauthorized/)
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
  it('passes with a delegated event-create capability', async () => {
    getSessionMock.mockResolvedValue(
      session({ canCreateEvents: false, capabilities: CAP.EVENT_CREATE_COMBAT.toString() }),
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

  it('owner with delegated event-create capability passes', async () => {
    getSessionMock.mockResolvedValue(
      session({
        canCreateEvents: false,
        discordId: 'owner-1',
        capabilities: CAP.EVENT_CREATE_COMBAT.toString(),
      }),
    )
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    const c = await requireEventCreatorForEvent('evt-1')
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })

  it('EVENT_MANAGE officer can edit an existing event without ownership', async () => {
    getSessionMock.mockResolvedValue(
      session({ discordId: 'manager-1', capabilities: CAP.EVENT_MANAGE.toString() }),
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

  it('EVENT_MANAGE officer can manage legacy events with null created_by', async () => {
    getSessionMock.mockResolvedValue(
      session({ discordId: 'manager-1', capabilities: CAP.EVENT_MANAGE.toString() }),
    )
    nextEventResult = { data: { created_by: null }, error: null }
    const c = await requireEventCreatorForEvent('evt-1')
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })

  it('legacy events with null created_by stay blocked for plain event creators', async () => {
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
    getSessionMock.mockResolvedValue(session({ canCreateEvents: true, discordId: 'owner-1' }))
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    const r = await requireEventCreatorOrPartyCaller('evt-1', 'p-1')
    expect(r.isAdminOrOwner).toBe(true)
  })

  it('former event owner without event creation authority is not treated as owner', async () => {
    getSessionMock.mockResolvedValue(session({ canCreateEvents: false, discordId: 'owner-1' }))
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    nextPartyResult = {
      data: { event_id: 'evt-1', caller_discord_id: 'caller-1' },
      error: null,
    }
    await expect(
      requireEventCreatorOrPartyCaller('evt-1', 'p-1'),
    ).rejects.toThrow(/Unauthorized/)
  })

  it('EVENT_MANAGE officer gets isAdminOrOwner=true', async () => {
    getSessionMock.mockResolvedValue(
      session({ discordId: 'manager-1', capabilities: CAP.EVENT_MANAGE.toString() }),
    )
    nextEventResult = { data: { created_by: 'owner-1' }, error: null }
    const r = await requireEventCreatorOrPartyCaller('evt-1', 'p-1')
    expect(r.isAdminOrOwner).toBe(true)
  })

  it('party caller passes with isAdminOrOwner=false', async () => {
    getSessionMock.mockResolvedValue(
      session({ discordId: 'caller-1', isBombSquadCaller: true }),
    )
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

  it('EVENT_MANAGE officer can edit slots without owning the joined event', async () => {
    getSessionMock.mockResolvedValue(
      session({ discordId: 'manager-1', capabilities: CAP.EVENT_MANAGE.toString() }),
    )
    nextSlotResult = {
      data: { parties: { events: { created_by: 'owner-1' } } },
      error: null,
    }
    const c = await requireEventCreatorForSlot('slot-1')
    expect(c).toMatchObject(ADMIN_SENTINEL)
  })

  it('EVENT_MANAGE officer is still blocked when the slot join is missing', async () => {
    getSessionMock.mockResolvedValue(
      session({ discordId: 'manager-1', capabilities: CAP.EVENT_MANAGE.toString() }),
    )
    nextSlotResult = { data: null, error: null }
    await expect(requireEventCreatorForSlot('slot-1')).rejects.toThrow(/Unauthorized/)
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
