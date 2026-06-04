import { NextRequest, NextResponse } from 'next/server'
import itemSpells from '@/data/albion-item-spells.json'
import { normalizeSpellItemIds } from '@/lib/item-spell-api'
import type { SpellPoolEntry } from '@/types'

// Keep the default Node.js runtime. Vercel Fluid Compute is the platform default
// and this route only performs in-memory map lookups.

// Enchantment variants share the base item's spell pool. items.xml only
// defines the base (e.g. T8_MAIN_MACE); the @N suffix is assembled by
// downstream consumers.
function stripEnchantment(id: string): string {
  const at = id.indexOf('@')
  return at >= 0 ? id.slice(0, at) : id
}

const POOL = itemSpells as Record<string, SpellPoolEntry[]>

export function GET(request: NextRequest) {
  const ids = normalizeSpellItemIds(request.nextUrl.searchParams.getAll('id'))
  if (ids.length === 0) return NextResponse.json({})

  const out: Record<string, SpellPoolEntry[]> = {}
  for (const id of ids) {
    const base = stripEnchantment(id)
    const pool = POOL[base]
    out[id] = Array.isArray(pool) ? pool : []
  }
  return NextResponse.json(out)
}
