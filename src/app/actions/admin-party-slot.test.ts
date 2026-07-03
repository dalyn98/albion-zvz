import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireEventCreatorForSlot: vi.fn(),
  requireEventCreatorOrPartyCaller: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
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

import { clearSlotAssignment, savePartySlots } from './admin-party-slot'
import {
  slotToRow,
  type SlotPayload,
} from './admin-slot-sanitizers'
import { SLOT_KEYS, type EventCategory, type SlotKey } from '@/types'

interface QueryCall {
  method: string
  args: unknown[]
}

interface UpdateCall {
  table: string
  row: Record<string, unknown>
  filters: [string, unknown][]
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

function rowForExistingSlot(partyId: string, slot: SlotPayload): Record<string, unknown> {
  return {
    id: slot.id ?? '',
    ...slotToRow(partyId, slot),
    assigned_discord_id: null,
    requested_discord_id: null,
  }
}

function resolveQueryResult(
  table: string,
  operation: string | null,
  selectedColumns: string | null,
  rows: Record<string, unknown>[],
) {
  if (operation === 'update' || operation === 'delete' || operation === 'insert') {
    return { error: null }
  }
  if (table === 'slots' && selectedColumns === 'id, assigned_discord_id, requested_discord_id') {
    return {
      data: rows.map((row) => ({
        id: row.id,
        assigned_discord_id: row.assigned_discord_id ?? null,
        requested_discord_id: row.requested_discord_id ?? null,
      })),
      error: null,
    }
  }
  if (table === 'slots') return { data: rows, error: null }
  return { data: [], error: null }
}

function createSavePartySlotsDb(
  existingRows: Record<string, unknown>[],
  updateCalls: UpdateCall[],
) {
  const db = {
    from(table: string) {
      let operation: string | null = null
      let selectedColumns: string | null = null
      let updateRow: Record<string, unknown> | null = null
      const filters: [string, unknown][] = []
      const query = {
        select(columns: string) {
          operation = 'select'
          selectedColumns = columns
          return query
        },
        update(row: Record<string, unknown>) {
          operation = 'update'
          updateRow = row
          return query
        },
        insert(row: Record<string, unknown> | Record<string, unknown>[]) {
          operation = 'insert'
          updateRow = Array.isArray(row) ? { rows: row } : row
          return query
        },
        delete() {
          operation = 'delete'
          return query
        },
        eq(column: string, value: unknown) {
          filters.push([column, value])
          return query
        },
        in(column: string, value: unknown) {
          filters.push([column, value])
          return query
        },
        maybeSingle() {
          if (table === 'events') {
            return Promise.resolve({
              data: { id: 'event-1', category: '전투' satisfies EventCategory },
              error: null,
            })
          }
          return Promise.resolve({ data: null, error: null })
        },
        single() {
          return Promise.resolve({ data: { id: 'party-1' }, error: null })
        },
        then(resolve: (value: { data?: unknown; error: null }) => void) {
          if (operation === 'update' && updateRow) {
            updateCalls.push({ table, row: updateRow, filters: [...filters] })
          }
          return Promise.resolve(
            resolveQueryResult(table, operation, selectedColumns, existingRows),
          ).then(resolve)
        },
      }
      return query
    },
  }
  return db
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
  })

  it('restores every parked slot number after a reorder, including slots whose final position did not change', async () => {
    const partyId = 'party-1'
    const slot1 = createSlotPayload('slot-1', 1)
    const slot2 = createSlotPayload('slot-2', 2)
    const slot3 = createSlotPayload('slot-3', 3)
    const reordered = [
      { ...slot2, slot_number: 1 },
      { ...slot1, slot_number: 2 },
      { ...slot3, slot_number: 3 },
    ]
    const updateCalls: UpdateCall[] = []
    const db = createSavePartySlotsDb([
      rowForExistingSlot(partyId, slot1),
      rowForExistingSlot(partyId, slot2),
      rowForExistingSlot(partyId, slot3),
    ], updateCalls)

    mocks.getSession.mockResolvedValue({ discordId: 'manager-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireEventCreatorOrPartyCaller.mockResolvedValue({
      db,
      isAdminOrOwner: false,
    })

    await expect(
      savePartySlots(
        'event-1',
        1,
        partyId,
        reordered,
        ['slot-1', 'slot-2', 'slot-3'],
      ),
    ).resolves.toEqual({})

    const slotUpdates = updateCalls.filter((call) => call.table === 'slots')
    expect(slotUpdates.map((call) => call.row.slot_number)).toEqual([
      1001,
      1002,
      1003,
      1,
      2,
      3,
    ])
    expect(slotUpdates.at(-1)).toMatchObject({
      row: { slot_number: 3 },
      filters: [
        ['guild_id', 'guild-1'],
        ['id', 'slot-3'],
      ],
    })
  })
})
