import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireEventCreatorForSlot: vi.fn(),
  requireEventCreatorOrPartyCaller: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireEventCreatorForSlot: mocks.requireEventCreatorForSlot,
  requireEventCreatorOrPartyCaller: mocks.requireEventCreatorOrPartyCaller,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
  },
}))

import { clearSlotAssignment, savePartySlots } from './admin-party-slot'
import {
  type SlotPayload,
} from './admin-slot-sanitizers'
import { SLOT_KEYS, type EventCategory, type SlotKey } from '@/types'

interface QueryCall {
  method: string
  args: unknown[]
}

function createSlotPayload(id: string, slotNumber: number): SlotPayload {
  const items = SLOT_KEYS.reduce((acc, key) => ({
    ...acc,
    [key]: { name: '', id: '' },
  }), {} as Record<SlotKey, { name: string; id: string }>)
  const options = SLOT_KEYS.reduce((acc, key) => ({
    ...acc,
    [key]: [],
  }), {} as Record<SlotKey, []>)
  const spells = SLOT_KEYS.reduce((acc, key) => ({
    ...acc,
    [key]: [],
  }), {} as Record<SlotKey, string[]>)

  return {
    id,
    slot_number: slotNumber,
    is_hidden: false,
    role_name: 'EngageDps',
    notes: '',
    items,
    options,
    spells,
    auto_regear_excluded: false,
    manual_regear_excluded: false,
    is_solo_bomb: false,
    conditional_options: null,
  }
}

const PARTY_ID = '10000000-0000-4000-8000-000000000001'

function createAtomicSaveDb(options: {
  slotsVersion?: number
  error?: { message: string; code?: string }
  affectedDiscordIds?: string[]
} = {}) {
  const eventQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: 'event-1', category: '전투' satisfies EventCategory },
      error: null,
    }),
  }
  const rpc = vi.fn().mockImplementation(async (_name: string, args: Record<string, unknown>) => {
    if (options.error) return { data: null, error: options.error }
    const rows = args.p_slots as Array<{ id: string }>
    return {
      data: {
        party_id: PARTY_ID,
        slots_version: options.slotsVersion ?? Number(args.p_expected_version) + 1,
        slot_ids: rows.map((row) => row.id),
        affected_discord_ids: options.affectedDiscordIds ?? [],
      },
      error: null,
    }
  })
  return {
    db: {
      from: vi.fn().mockReturnValue(eventQuery),
      rpc,
    },
    rpc,
  }
}

function createSlotLookupQuery(calls: QueryCall[]) {
  const query = {
    select(columns: string) {
      calls.push({ method: 'select', args: [columns] })
      return query
    },
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    maybeSingle() {
      calls.push({ method: 'maybeSingle', args: [] })
      return Promise.resolve({
        data: {
          assigned_discord_id: 'member-1',
          parties: {
            event_id: 'event-1',
            party_number: 4,
          },
        },
        error: null,
      })
    },
  }
  return query
}

function createSlotUpdateQuery(calls: QueryCall[]) {
  const query: Record<string, unknown> = {
    update(row: unknown) {
      calls.push({ method: 'update', args: [row] })
      return query
    },
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    then(resolve: (value: { error: null }) => void) {
      return Promise.resolve({ error: null }).then(resolve)
    },
  }
  return query
}

describe('clearSlotAssignment', () => {
  beforeEach(() => {
    mocks.requireEventCreatorForSlot.mockReset()
    mocks.requireEventCreatorOrPartyCaller.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.logError.mockReset()
  })

  it('clears both the assigned member and all assigned gear picks', async () => {
    const calls: QueryCall[] = []
    const from = vi
      .fn()
      .mockReturnValueOnce(createSlotLookupQuery(calls))
      .mockReturnValueOnce(createSlotUpdateQuery(calls))
    const db = { from }

    mocks.getSession.mockResolvedValue({ discordId: 'manager-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireEventCreatorForSlot.mockResolvedValue(db)

    await expect(clearSlotAssignment('slot-1')).resolves.toEqual({})

    expect(from).toHaveBeenNthCalledWith(1, 'slots')
    expect(from).toHaveBeenNthCalledWith(2, 'slots')
    expect(calls.find((call) => call.method === 'update')?.args[0]).toEqual({
      assigned_discord_id: null,
      assigned_username: null,
      assigned_weapon_name: null,
      assigned_weapon_id: null,
      assigned_head_name: null,
      assigned_head_id: null,
      assigned_armor_name: null,
      assigned_armor_id: null,
      assigned_shoes_name: null,
      assigned_shoes_id: null,
      assigned_offhand_name: null,
      assigned_offhand_id: null,
      assigned_potion_name: null,
      assigned_potion_id: null,
      assigned_food_name: null,
      assigned_food_id: null,
      assigned_cape_name: null,
      assigned_cape_id: null,
      assigned_mount_name: null,
      assigned_mount_id: null,
    })
    expect(calls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['id', 'slot-1'] })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1/party/4')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/members/member-1')
  })
})

describe('savePartySlots', () => {
  beforeEach(() => {
    mocks.requireEventCreatorForSlot.mockReset()
    mocks.requireEventCreatorOrPartyCaller.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.logError.mockReset()
  })

  function authorize(db: ReturnType<typeof createAtomicSaveDb>['db'], isAdminOrOwner = true): void {
    mocks.getSession.mockResolvedValue({ discordId: 'manager-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireEventCreatorOrPartyCaller.mockResolvedValue({ db, isAdminOrOwner })
  }

  it('returns the committed party identity and version from one atomic save', async () => {
    const slotId = '20000000-0000-4000-8000-000000000001'
    const slot = createSlotPayload(slotId, 1)
    const { db, rpc } = createAtomicSaveDb({ slotsVersion: 8 })
    authorize(db)

    await expect(
      savePartySlots('event-1', 1, PARTY_ID, [slot], 7),
    ).resolves.toEqual({
      partyId: PARTY_ID,
      slotsVersion: 8,
      slotIds: [slotId],
    })

    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('sends reorder, deletion, addition, and gear edits as one normalized layout', async () => {
    const slotA = createSlotPayload('20000000-0000-4000-8000-000000000001', 1)
    const slotB = createSlotPayload('20000000-0000-4000-8000-000000000002', 2)
    const added = createSlotPayload('20000000-0000-4000-8000-000000000004', 9)
    added.items.weapon = { name: 'Edited weapon', id: 'T8_MAIN_AXE' }
    const finalLayout = [slotB, added, slotA]
    const { db, rpc } = createAtomicSaveDb()
    authorize(db)

    await savePartySlots('event-1', 1, PARTY_ID, finalLayout, 3)

    expect(rpc).toHaveBeenCalledWith('save_party_slots_atomic', expect.objectContaining({
      p_guild_id: 'guild-1',
      p_event_id: 'event-1',
      p_party_number: 1,
      p_party_id: PARTY_ID,
      p_expected_version: 3,
      p_slots: [
        expect.objectContaining({ id: slotB.id, slot_number: 1 }),
        expect.objectContaining({
          id: added.id,
          slot_number: 2,
          weapon_name: 'Edited weapon',
          weapon_id: 'T8_MAIN_AXE',
        }),
        expect.objectContaining({ id: slotA.id, slot_number: 3 }),
      ],
    }))
  })

  it('assigns a stable UUID to an id-less slot before the atomic call', async () => {
    const existing = createSlotPayload('20000000-0000-4000-8000-000000000001', 1)
    const added = createSlotPayload('', 1)
    const { db, rpc } = createAtomicSaveDb()
    authorize(db)

    const result = await savePartySlots('event-1', 1, PARTY_ID, [existing, added], 4)
    const rpcRows = rpc.mock.calls[0]?.[1].p_slots as Array<{ id: string; slot_number: number }>

    expect(rpcRows[1]?.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(rpcRows.map((row) => row.slot_number)).toEqual([1, 2])
    expect(result.slotIds).toEqual(rpcRows.map((row) => row.id))
  })

  it('allows combat party numbers above 20', async () => {
    const slot = createSlotPayload('20000000-0000-4000-8000-000000000001', 1)
    const { db, rpc } = createAtomicSaveDb()
    authorize(db, false)

    await expect(
      savePartySlots('event-1', 21, PARTY_ID, [slot], 0),
    ).resolves.toMatchObject({ slotsVersion: 1 })
    expect(rpc.mock.calls[0]?.[1].p_party_number).toBe(21)
  })

  it('returns a localized refresh conflict instead of a database error', async () => {
    const slot = createSlotPayload('20000000-0000-4000-8000-000000000001', 1)
    const { db } = createAtomicSaveDb({ error: { message: 'PARTY_SLOTS_STALE' } })
    authorize(db)

    await expect(
      savePartySlots('event-1', 1, PARTY_ID, [slot], 2),
    ).resolves.toEqual({ error: 'partySlotsStale' })
    expect(mocks.logError).toHaveBeenCalledOnce()
  })

  it('never exposes a raw unique-constraint message', async () => {
    const slot = createSlotPayload('20000000-0000-4000-8000-000000000001', 1)
    const { db } = createAtomicSaveDb({
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint slots_party_id_slot_number_key',
      },
    })
    authorize(db)

    await expect(
      savePartySlots('event-1', 1, PARTY_ID, [slot], 2),
    ).resolves.toEqual({ error: 'partySaveFailed' })
    expect(mocks.logError).toHaveBeenCalledOnce()
  })
})
