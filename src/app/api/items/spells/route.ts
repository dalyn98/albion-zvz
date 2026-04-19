import { NextRequest, NextResponse } from 'next/server'
import itemSpells from '@/data/albion-item-spells.json'

// Edge runtime: lookups are pure in-memory map reads, no network egress.
export const runtime = 'edge'

// Enchantment variants share the base item's spell pool. items.xml only
// defines the base (e.g. T8_MAIN_MACE); the @N suffix is assembled by
// downstream consumers.
function stripEnchantment(id: string): string {
  const at = id.indexOf('@')
  return at >= 0 ? id.slice(0, at) : id
}

const POOL = itemSpells as Record<string, string[]>

export function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.getAll('id').map((s) => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({})

  const out: Record<string, string[]> = {}
  for (const id of ids) {
    const base = stripEnchantment(id)
    const pool = POOL[base]
    out[id] = Array.isArray(pool) ? pool : []
  }
  return NextResponse.json(out)
}
