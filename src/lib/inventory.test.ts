import { describe, it, expect, vi } from 'vitest'

// Mock supabase-admin so importing inventory.ts doesn't try to connect.
vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: vi.fn(),
}))

import { categorizeGearItem, extractGearItemIdsFromBuild } from './inventory'
import type { BuildSnapshot } from '@/types'

describe('categorizeGearItem', () => {
  it('classifies 2H weapons', () => {
    const r = categorizeGearItem('T8_2H_GALATINEPAIR')
    expect(r.slot).toBe('weapon')
    expect(r.tier).toBe(8)
    expect(r.armorMaterial).toBeNull()
  })

  it('classifies main-hand weapons', () => {
    const r = categorizeGearItem('T7_MAIN_SWORD')
    expect(r.slot).toBe('weapon')
    expect(r.tier).toBe(7)
  })

  it('classifies offhand items', () => {
    const r = categorizeGearItem('T6_OFF_SHIELD')
    expect(r.slot).toBe('offhand')
    expect(r.tier).toBe(6)
  })

  it('classifies armor pieces with material', () => {
    expect(categorizeGearItem('T8_HEAD_PLATE_SET1')).toEqual({
      slot: 'head',
      armorMaterial: 'PLATE',
      tier: 8,
    })
    expect(categorizeGearItem('T6_ARMOR_LEATHER_SET2')).toEqual({
      slot: 'armor',
      armorMaterial: 'LEATHER',
      tier: 6,
    })
    expect(categorizeGearItem('T4_SHOES_CLOTH_SET3')).toEqual({
      slot: 'shoes',
      armorMaterial: 'CLOTH',
      tier: 4,
    })
  })

  it('classifies armor without suffix (T8_HEAD_PLATE)', () => {
    // The `(?:_|$)` boundary in ARMOR_PIECE_RE handles trailing material.
    const r = categorizeGearItem('T8_HEAD_PLATE')
    expect(r.slot).toBe('head')
    expect(r.armorMaterial).toBe('PLATE')
    expect(r.tier).toBe(8)
  })

  it('classifies armor with KEEPER/AVALON suffix', () => {
    // Bug regression: `\b` doesn't catch `_KEEPER` boundary. Must use `(?:_|$)`.
    expect(categorizeGearItem('T8_HEAD_PLATE_KEEPER').slot).toBe('head')
    expect(categorizeGearItem('T8_ARMOR_LEATHER_AVALON').slot).toBe('armor')
  })

  it('classifies capes (both CAPE and CAPEITEM variants)', () => {
    expect(categorizeGearItem('T8_CAPE').slot).toBe('cape')
    expect(categorizeGearItem('T8_CAPEITEM_FW_BRIDGEWATCH').slot).toBe('cape')
  })

  it('classifies bags', () => {
    expect(categorizeGearItem('T4_BAG').slot).toBe('bag')
    expect(categorizeGearItem('T8_BAG_INSIGHT').slot).toBe('bag')
  })

  it('classifies tools as other (not weapon) even though they match T*_2H_*', () => {
    // Tools start with T*_2H_TOOL_ and would otherwise greedy-match WEAPON_RE.
    expect(categorizeGearItem('T8_2H_TOOL_PICK').slot).toBe('other')
    expect(categorizeGearItem('T6_2H_TOOL_SICKLE').slot).toBe('other')
  })

  it('strips enchant suffix (@N) before matching', () => {
    expect(categorizeGearItem('T8_2H_GALATINEPAIR@4').slot).toBe('weapon')
    expect(categorizeGearItem('T6_HEAD_PLATE_SET1@2').armorMaterial).toBe('PLATE')
  })

  it('returns other with extracted tier for unknown patterns', () => {
    const r = categorizeGearItem('T5_SOMETHING_UNRECOGNIZED')
    expect(r.slot).toBe('other')
    expect(r.tier).toBe(5)
  })

  it('returns other with null tier for completely unrecognized IDs', () => {
    const r = categorizeGearItem('UNIQUE_THING')
    expect(r.slot).toBe('other')
    expect(r.tier).toBeNull()
  })
})

describe('extractGearItemIdsFromBuild', () => {
  const empty = (): BuildSnapshot => ({
    role_name: null,
    weapon: { name: null, id: null },
    head: { name: null, id: null },
    armor: { name: null, id: null },
    shoes: { name: null, id: null },
    offhand: { name: null, id: null },
    potion: { name: null, id: null },
    food: { name: null, id: null },
    cape: { name: null, id: null },
    mount: { name: null, id: null },
  })

  it('returns empty array for empty snapshot', () => {
    expect(extractGearItemIdsFromBuild(empty())).toEqual([])
  })

  it('extracts core equipment slots and can exclude cape from craft fulfillment', () => {
    const snap: BuildSnapshot = {
      ...empty(),
      weapon: { name: 'sword', id: 'T8_2H_SWORD' },
      head: { name: 'helm', id: 'T8_HEAD_PLATE_SET1' },
      armor: { name: 'plate', id: 'T8_ARMOR_PLATE_SET2' },
      shoes: { name: 'boots', id: 'T8_SHOES_PLATE_SET1' },
      offhand: { name: 'shield', id: 'T8_OFF_SHIELD' },
      cape: { name: 'cape', id: 'T8_CAPEITEM_FW_BRIDGEWATCH' },
      potion: { name: 'pot', id: 'T8_POTION_HEAL' },
      food: { name: 'food', id: 'T8_MEAL_BEEFSTEW' },
      mount: { name: 'mount', id: 'T8_MOUNT_HORSE' },
    }
    const ids = extractGearItemIdsFromBuild(snap, {
      includedSlots: ['weapon', 'head', 'armor', 'shoes', 'offhand'],
    })
    expect(ids).toHaveLength(5)
    expect(ids).toContain('T8_2H_SWORD')
    expect(ids).toContain('T8_HEAD_PLATE_SET1')
    expect(ids).not.toContain('T8_CAPEITEM_FW_BRIDGEWATCH')
    expect(ids).not.toContain('T8_POTION_HEAL')
    expect(ids).not.toContain('T8_MEAL_BEEFSTEW')
    expect(ids).not.toContain('T8_MOUNT_HORSE')
  })

  it('includes cape when the craft fulfillment slots explicitly contain cape', () => {
    const snap: BuildSnapshot = {
      ...empty(),
      weapon: { name: 'sword', id: 'T8_2H_SWORD' },
      cape: { name: 'cape', id: 'T8_CAPEITEM_FW_BRIDGEWATCH' },
    }

    const ids = extractGearItemIdsFromBuild(snap, {
      includedSlots: ['weapon', 'head', 'armor', 'shoes', 'offhand', 'cape'],
    })

    expect(ids).toEqual(['T8_2H_SWORD', 'T8_CAPEITEM_FW_BRIDGEWATCH'])
  })

  it('drops slots whose id is empty/whitespace', () => {
    const snap: BuildSnapshot = {
      ...empty(),
      weapon: { name: 'sword', id: '   ' },
      head: { name: 'helm', id: '' },
    }
    expect(extractGearItemIdsFromBuild(snap)).toEqual([])
  })

  it('drops ids whose categorization is "other"', () => {
    const snap: BuildSnapshot = {
      ...empty(),
      weapon: { name: 'tool', id: 'T8_2H_TOOL_PICK' }, // 'other' slot
      head: { name: 'helm', id: 'T8_HEAD_PLATE_SET1' },
    }
    const ids = extractGearItemIdsFromBuild(snap)
    expect(ids).toEqual(['T8_HEAD_PLATE_SET1'])
  })
})
