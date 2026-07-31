import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const lifecycleSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/329_event_operational_lifecycle.sql'),
  'utf8',
)
const retiredReviewSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/330_retire_subjective_event_review.sql'),
  'utf8',
)

describe('event operational lifecycle migrations', () => {
  it('adds explicit publication and deterministic operational boundaries', () => {
    expect(lifecycleSql).toMatch(/add column if not exists published_at timestamptz/i)
    expect(lifecycleSql).toMatch(/add column if not exists operational_ended_at timestamptz/i)
    expect(lifecycleSql).toMatch(
      /operational_ended_at = battle_started_at \+ interval '1 hour'/i,
    )
    expect(lifecycleSql).toMatch(
      /status = 'published'[\s\S]*gather_at >= clock_timestamp\(\) - interval '6 hours'/i,
    )
  })

  it('locks started event, party, slot, and build configuration', () => {
    expect(lifecycleSql).toContain('event_operational_snapshot_locked')
    expect(lifecycleSql).toContain('event_operational_composition_locked')
    for (const table of [
      'public.parties',
      'public.slots',
      'public.event_build_role_demands',
      'public.event_build_party_assigners',
      'public.event_build_applications',
    ]) {
      expect(lifecycleSql).toContain(table)
    }
    expect(lifecycleSql).toMatch(
      /if tg_op = 'DELETE' and pg_trigger_depth\(\) > 1 then[\s\S]*return old/i,
    )
  })

  it('makes auto-start mandatory without retroactively starting legacy history', () => {
    expect(lifecycleSql).toMatch(
      /'events_auto_start_enabled', 'true'[\s\S]*on conflict \(guild_id, key\) do update/i,
    )
    expect(lifecycleSql).toContain('event_auto_start_is_mandatory')
    expect(lifecycleSql).toMatch(
      /where status = 'published'[\s\S]*published_at is not null[\s\S]*battle_started_at is null/i,
    )
    expect(lifecycleSql).not.toMatch(
      /update public\.events[\s\S]*set battle_started_at = gather_at/i,
    )
  })

  it('preserves historical AAR rows and blocks all new direct writes', () => {
    expect(retiredReviewSql).toMatch(
      /revoke all privileges[\s\S]*event_after_action_reviews[\s\S]*service_role/i,
    )
    expect(retiredReviewSql).toMatch(
      /grant select[\s\S]*event_after_action_reviews[\s\S]*service_role/i,
    )
    expect(retiredReviewSql).toContain('event_after_action_review_retired')
    expect(retiredReviewSql).not.toMatch(
      /delete from public\.event_after_action_reviews/i,
    )
  })
})
