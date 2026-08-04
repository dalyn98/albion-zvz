import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/380_agm_battles_funnel_events.sql', import.meta.url),
  'utf8',
)

describe('AGM Battles funnel migration', () => {
  it('extends the constrained event taxonomy without weakening table access', () => {
    for (const event of [
      'battles_board_view',
      'battles_search',
      'battle_report_open',
      'guild_record_open',
      'alliance_record_open',
      'battle_share',
      'guild_connect',
    ]) {
      expect(migration).toContain(`'${event}'`)
    }
    expect(migration).toContain('not valid')
    expect(migration).toContain('validate constraint')
    expect(migration).not.toMatch(/disable row level security/i)
  })
})
