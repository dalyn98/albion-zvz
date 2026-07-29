import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/291_participation_day_targets.sql', import.meta.url),
  'utf8',
)

describe('participation-day targets migration contract', () => {
  it('keeps existing guilds on the session-only policy', () => {
    expect(migration).toMatch(
      /session_target_enabled boolean not null default true/i,
    )
    expect(migration).toMatch(
      /participation_days_target_enabled boolean not null default false/i,
    )
    expect(migration).toMatch(
      /weekly_min_participation_days integer not null default 0/i,
    )
  })

  it('requires at least one valid participation target', () => {
    expect(migration).toMatch(
      /check\s*\(\s*session_target_enabled\s+or\s+participation_days_target_enabled\s*\)/i,
    )
    expect(migration).toMatch(
      /not participation_days_target_enabled[\s\S]*weekly_min_participation_days between 1 and 7/i,
    )
  })
})
