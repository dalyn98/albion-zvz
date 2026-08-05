import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/386_public_zvz_season_33_label.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ Season 33 label migration', () => {
  it('renames only the first data season legacy label without changing its boundary', () => {
    expect(migration).toContain("name = 'Season 33'")
    expect(migration).toContain("starts_on = date '2026-07-24'")
    expect(migration).toContain("name = 'Season 2026-07-24'")
    expect(migration).not.toMatch(/set\s+starts_on\s*=/i)
    expect(migration).not.toMatch(/,\s*starts_on\s*=/i)
    expect(migration).not.toContain('delete from')
  })
})
