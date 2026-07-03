import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, parseGuildBackup } from './guild-backup'

function baseBackup(overrides: Record<string, unknown>) {
  return {
    version: BACKUP_VERSION,
    exportedAt: '2026-06-02T00:00:00.000Z',
    sourceGuildId: 'source-guild',
    sourceGuildName: 'Source',
    points: { balances: [] },
    templates: { events: [], slots: [] },
    inventory: { items: [] },
    ...overrides,
  }
}

describe('parseGuildBackup', () => {
  it('deduplicates repeated logical rows so import applies each key once', () => {
    const { backup, error } = parseGuildBackup(baseBackup({
      points: {
        balances: [
          { discordId: 'user-1', username: 'First', balance: 100 },
          { discordId: 'user-1', username: 'Last', balance: 40 },
        ],
      },
      templates: {
        events: [
          { name: 'CTA', data: { parties: [{ party_number: 1, slots: [] }] } },
          { name: 'CTA', data: { parties: [{ party_number: 2, slots: [] }] } },
        ],
        slots: [
          { name: 'Clap', category: '전투', data: { role_name: 'EngageDps' } },
          { name: 'Clap', category: 'FF', data: { role_name: 'Support' } },
        ],
      },
      inventory: {
        items: [
          {
            uniqueName: 'T8_MAIN_SWORD',
            enchant: 1,
            quality: 2,
            stock: 1,
            manualPrice: null,
          },
          {
            uniqueName: 'T8_MAIN_SWORD',
            enchant: 1,
            quality: 2,
            stock: 3,
            manualPrice: 12000,
          },
        ],
      },
    }))

    expect(error).toBeUndefined()
    expect(backup?.points.balances).toEqual([
      { discordId: 'user-1', username: 'Last', balance: 40 },
    ])
    expect(backup?.templates.events).toEqual([
      { name: 'CTA', data: { parties: [{ party_number: 2, slots: [] }] } },
    ])
    expect(backup?.templates.slots).toEqual([
      { name: 'Clap', category: 'FF', data: { role_name: 'Support' } },
    ])
    expect(backup?.inventory.items).toEqual([
      {
        uniqueName: 'T8_MAIN_SWORD',
        enchant: 1,
        quality: 2,
        nameKo: null,
        category: null,
        tier: null,
        stock: 3,
        manualPrice: 12000,
      },
    ])
  })

  it('skips malformed inventory item identifiers and int-overflowing values', () => {
    const { backup, error } = parseGuildBackup(baseBackup({
      inventory: {
        items: [
          {
            uniqueName: 'T8_MAIN_SWORD<script>',
            enchant: 0,
            quality: 1,
            stock: 1,
            manualPrice: 10,
          },
          {
            uniqueName: 'A'.repeat(81),
            enchant: 0,
            quality: 1,
            stock: 1,
            manualPrice: 10,
          },
          {
            uniqueName: 'T8_MAIN_SWORD',
            enchant: 0,
            quality: 1,
            stock: 2147483648,
            manualPrice: 10,
          },
          {
            uniqueName: 'T8_MAIN_SWORD',
            enchant: 0,
            quality: 1,
            stock: 1,
            manualPrice: 2147483648,
          },
        ],
      },
    }))

    expect(error).toBeUndefined()
    expect(backup?.inventory.items).toEqual([
      {
        uniqueName: 'T8_MAIN_SWORD',
        enchant: 0,
        quality: 1,
        nameKo: null,
        category: null,
        tier: null,
        stock: 1,
        manualPrice: null,
      },
    ])
  })
})
