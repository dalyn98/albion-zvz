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

import { clearSlotAssignment } from './admin-party-slot'

interface QueryCall {
  method: string
  args: unknown[]
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
