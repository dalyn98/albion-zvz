import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireEventCreator: vi.fn(),
  requireEventCreatorForEvent: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireEventCreator: mocks.requireEventCreator,
  requireEventCreatorForEvent: mocks.requireEventCreatorForEvent,
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

import { FREE_ITEM_NAME, SLOT_KEYS, type GearOption } from '@/types'
import { applyTemplate, createEventFromTemplate, listTemplates, updateTemplate, type TemplateData } from './templates'

interface QueryCall {
  table: string
  method: string
  args: unknown[]
}

function createTemplateListQuery(calls: QueryCall[]) {
  const query = {
    select(columns: string) {
      calls.push({ table: 'event_templates', method: 'select', args: [columns] })
      return query
    },
    eq(column: string, value: unknown) {
      calls.push({ table: 'event_templates', method: 'eq', args: [column, value] })
      return query
    },
    order(column: string, options: unknown) {
      calls.push({ table: 'event_templates', method: 'order', args: [column, options] })
      return Promise.resolve({
        data: [{ id: 'tpl-1', name: 'CTA', created_at: '2026-05-25T00:00:00.000Z' }],
        error: null,
      })
    },
  }
  return query
}

function createPartyCountQuery(calls: QueryCall[]) {
  let eqCalls = 0
  const query = {
    select(columns: string, options: unknown) {
      calls.push({ table: 'parties', method: 'select', args: [columns, options] })
      return query
    },
    eq(column: string, value: unknown) {
      calls.push({ table: 'parties', method: 'eq', args: [column, value] })
      eqCalls += 1
      if (eqCalls >= 2) return Promise.resolve({ count: 0, error: null })
      return query
    },
  }
  return query
}

function createTemplateFetchQuery(calls: QueryCall[]) {
  const query = {
    select(columns: string) {
      calls.push({ table: 'event_templates', method: 'select', args: [columns] })
      return query
    },
    eq(column: string, value: unknown) {
      calls.push({ table: 'event_templates', method: 'eq', args: [column, value] })
      return query
    },
    single() {
      calls.push({ table: 'event_templates', method: 'single', args: [] })
      return Promise.resolve({ data: { data: { parties: [] } }, error: null })
    },
  }
  return query
}

function createTemplateUpdateQuery(calls: QueryCall[], updates: unknown[]) {
  let mode: 'lookup' | 'update' = 'lookup'
  let updateEqCalls = 0
  const query = {
    select(columns: string) {
      calls.push({ table: 'event_templates', method: 'select', args: [columns] })
      return query
    },
    eq(column: string, value: unknown) {
      calls.push({ table: 'event_templates', method: 'eq', args: [column, value] })
      if (mode === 'update') {
        updateEqCalls += 1
        if (updateEqCalls >= 2) return Promise.resolve({ error: null })
      }
      return query
    },
    neq(column: string, value: unknown) {
      calls.push({ table: 'event_templates', method: 'neq', args: [column, value] })
      return query
    },
    order(column: string, options: unknown) {
      calls.push({ table: 'event_templates', method: 'order', args: [column, options] })
      return query
    },
    limit(value: number) {
      calls.push({ table: 'event_templates', method: 'limit', args: [value] })
      return Promise.resolve({ data: [], error: null })
    },
    update(payload: unknown) {
      mode = 'update'
      updates.push(payload)
      calls.push({ table: 'event_templates', method: 'update', args: [payload] })
      return query
    },
  }
  return query
}

function emptyGearColumns(): Record<string, null> {
  return SLOT_KEYS.reduce(
    (acc, key) => ({
      ...acc,
      [`${key}_name`]: null,
      [`${key}_id`]: null,
      [`${key}_options`]: null,
    }),
    {} as Record<string, null>,
  )
}

function makeTemplateSlot(
  overrides: Partial<TemplateData['parties'][number]['slots'][number]> = {},
): TemplateData['parties'][number]['slots'][number] {
  return {
    slot_number: 1,
    role_name: null,
    notes: null,
    spells: null,
    gear_specs: null,
    conditional_options: null,
    ...emptyGearColumns(),
    ...overrides,
  } as TemplateData['parties'][number]['slots'][number]
}

describe('event template actions', () => {
  beforeEach(() => {
    mocks.requireEventCreator.mockReset()
    mocks.requireEventCreatorForEvent.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('lists templates with event-creator permission, not admin-only permission', async () => {
    const calls: QueryCall[] = []
    const db = { from: vi.fn(() => createTemplateListQuery(calls)) }
    mocks.getSession.mockResolvedValue({
      discordId: 'creator-1',
      isAdmin: false,
      canCreateEvents: true,
      eventCreatorCategories: ['전투'],
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireEventCreator.mockResolvedValue(db)

    await expect(listTemplates()).resolves.toEqual({
      templates: [{ id: 'tpl-1', name: 'CTA', created_at: '2026-05-25T00:00:00.000Z' }],
    })

    expect(mocks.requireEventCreator).toHaveBeenCalled()
    expect(db.from).toHaveBeenCalledWith('event_templates')
    expect(calls).toContainEqual({
      table: 'event_templates',
      method: 'eq',
      args: ['guild_id', 'guild-1'],
    })
  })

  it('blocks template-created events outside the creator category scope', async () => {
    mocks.getSession.mockResolvedValue({
      discordId: 'creator-1',
      isAdmin: false,
      canCreateEvents: true,
      eventCreatorCategories: ['전투'],
    })

    await expect(createEventFromTemplate('tpl-1', { title: 'FF CTA', category: 'FF' })).resolves.toEqual({
      error: 'unauthorized',
    })
    expect(mocks.requireEventCreator).not.toHaveBeenCalled()
    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
  })

  it('applies a template through the target event ownership gate', async () => {
    const calls: QueryCall[] = []
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'parties') return createPartyCountQuery(calls)
        if (table === 'event_templates') return createTemplateFetchQuery(calls)
        throw new Error(`unexpected table: ${table}`)
      }),
    }
    mocks.getSession.mockResolvedValue({
      discordId: 'creator-1',
      isAdmin: false,
      canCreateEvents: true,
      eventCreatorCategories: ['전투'],
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireEventCreatorForEvent.mockResolvedValue(db)

    await expect(applyTemplate('event-1', 'tpl-1')).resolves.toEqual({
      error: 'templateHasNoParties',
    })

    expect(mocks.requireEventCreatorForEvent).toHaveBeenCalledWith('event-1')
    expect(calls).toContainEqual({
      table: 'parties',
      method: 'eq',
      args: ['event_id', 'event-1'],
    })
    expect(calls).toContainEqual({
      table: 'event_templates',
      method: 'eq',
      args: ['guild_id', 'guild-1'],
    })
  })

  it('sanitizes template data on the server update boundary', async () => {
    const calls: QueryCall[] = []
    const updates: unknown[] = []
    const db = { from: vi.fn(() => createTemplateUpdateQuery(calls, updates)) }
    mocks.getSession.mockResolvedValue({
      discordId: 'creator-1',
      isAdmin: false,
      canCreateEvents: true,
      eventCreatorCategories: ['전투'],
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireEventCreator.mockResolvedValue(db)

    await expect(updateTemplate('tpl-1', ' CTA ', {
      parties: [{
        party_number: 1,
        slots: [
          makeTemplateSlot({
            weapon_name: 'Bad weapon',
            weapon_id: 'T8_MAIN_SWORD<script>',
            head_name: FREE_ITEM_NAME,
            head_id: null,
            armor_name: ' Elder Armor ',
            armor_id: ' T8_ARMOR_PLATE_SET3 ',
            offhand_options: [
              { name: 'Torch', id: 'T8_OFF_TORCH', spells: ['PASSIVE_MAXLOAD', '<script>'] },
              { name: 'Bad', id: '../evil' },
            ] as GearOption[],
          }),
        ],
      }],
    })).resolves.toEqual({})

    const payload = updates[0] as { name: string; data: TemplateData }
    const slot = payload.data.parties[0].slots[0]
    expect(payload.name).toBe('CTA')
    expect(slot.weapon_name).toBeNull()
    expect(slot.weapon_id).toBeNull()
    expect(slot.head_name).toBe(FREE_ITEM_NAME)
    expect(slot.head_id).toBeNull()
    expect(slot.armor_name).toBe('Elder Armor')
    expect(slot.armor_id).toBe('T8_ARMOR_PLATE_SET3')
    expect(slot.offhand_options).toEqual([
      { name: 'Torch', id: 'T8_OFF_TORCH', spells: ['PASSIVE_MAXLOAD'] },
    ])
    expect(calls).toContainEqual({
      table: 'event_templates',
      method: 'eq',
      args: ['guild_id', 'guild-1'],
    })
  })
})
