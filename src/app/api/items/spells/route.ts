import { NextRequest, NextResponse } from 'next/server'
import itemSpells from '@/data/albion-item-spells.json'
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

// Defensive cap — one slot/editor opens with ≤20 item ids (weapon options
// + armor slots). A request asking for hundreds is almost certainly abuse
// or a client bug, and the response grows ~200 bytes per match.
const MAX_IDS_PER_REQUEST = 64

export function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams
    .getAll('id')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS_PER_REQUEST)
  if (ids.length === 0) return NextResponse.json({})

  const out: Record<string, SpellPoolEntry[]> = {}
  for (const id of ids) {
    const base = stripEnchantment(id)
    const pool = POOL[base]
    out[id] = Array.isArray(pool) ? pool : []
  }
  return NextResponse.json(out)
}
