import { describe, expect, it } from 'vitest'
import {
  MAX_SPELL_IDS_PER_REQUEST,
  chunkSpellItemIds,
  normalizeSpellItemIds,
} from './item-spell-api'

describe('normalizeSpellItemIds', () => {
  it('deduplicates ids and skips oversized or malformed values', () => {
    expect(
      normalizeSpellItemIds([
        ' T4_MAIN_SWORD ',
        'T4_MAIN_SWORD',
        'T4_MAIN_SWORD<script>',
        'A'.repeat(81),
        '',
      ]),
    ).toEqual(['T4_MAIN_SWORD'])
  })

  it('caps public spell pool requests to the server limit', () => {
    const ids = Array.from({ length: MAX_SPELL_IDS_PER_REQUEST + 10 }, (_, i) => `T4_FAKE_ITEM_${i}`)

    expect(normalizeSpellItemIds(ids)).toHaveLength(MAX_SPELL_IDS_PER_REQUEST)
  })
})

describe('chunkSpellItemIds', () => {
  it('splits client fetch batches using the same server request limit', () => {
    const ids = Array.from({ length: MAX_SPELL_IDS_PER_REQUEST + 1 }, (_, i) => `T4_FAKE_ITEM_${i}`)

    expect(chunkSpellItemIds(ids).map((chunk) => chunk.length)).toEqual([
      MAX_SPELL_IDS_PER_REQUEST,
      1,
    ])
  })
})
