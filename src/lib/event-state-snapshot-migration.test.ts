import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/273_event_snapshot_slot_assignments.sql'),
  'utf8',
)
const migrationDirectory = join(process.cwd(), 'supabase/migrations')
const dependencySql = readdirSync(migrationDirectory)
  .filter((fileName) => /^27[2-9]_.*\.sql$/.test(fileName))
  .sort()
  .map((fileName) => readFileSync(join(migrationDirectory, fileName), 'utf8'))
  .join('\n')
const revisionSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/274_event_snapshot_render_revisions.sql'),
  'utf8',
)
const slotRevisionDedupSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/275_event_snapshot_slot_revision_dedup.sql'),
  'utf8',
)

describe('event state snapshot migration', () => {
  it('keeps the snapshot tenant scoped and service-role only', () => {
    expect(sql).toMatch(/get_event_state_snapshot\s*\(/i)
    expect(sql).toMatch(/e\.guild_id\s*=\s*p_guild_id/i)
    expect(sql).toMatch(/p\.guild_id\s*=\s*p_guild_id/i)
    expect(sql).toMatch(/grant execute[\s\S]*to service_role/i)
    expect(sql).toMatch(/revoke all[\s\S]*from anon, authenticated/i)
  })

  it('observes party versions, live slot state, and every recruitment source', () => {
    expect(sql).toContain('to_jsonb(p)')
    expect(sql).toContain('s.assigned_discord_id')
    expect(sql).toContain('s.assigned_mount_id')
    expect(sql).toContain('s.requested_discord_id')
    expect(sql).toContain('s.requested_picks')
    expect(sql).toContain('event_tentative_signups')
    expect(sql).toContain('event_build_role_demands')
    expect(sql).toContain('event_build_party_assigners')
    expect(sql).toContain('event_build_applications')
  })

  it('tracks build-catalog and non-combat regear eligibility without hashing full template JSON', () => {
    expect(dependencySql).toContain('state_revision')
    expect(dependencySql).toMatch(/trigger[\s\S]*slot_templates/i)
    expect(dependencySql).toMatch(/trigger[\s\S]*event_regear_participants/i)
    expect(dependencySql).not.toContain('to_jsonb(st)')
    expect(dependencySql).toMatch(/recruitment_mode\s+in\s*\(\s*'build_sheet'\s*,\s*'hybrid'\s*\)/i)
    expect(dependencySql).toMatch(/security invoker/i)
    expect(dependencySql).toMatch(/check\s*\(state_revision\s*>=\s*0\)/i)
  })

  it('reads an O(1) event revision instead of aggregating rendered child rows on every poll', () => {
    expect(revisionSql).toContain('state_revision')
    expect(revisionSql).toMatch(/for each statement/i)
    expect(revisionSql).toMatch(/referencing new table/i)
    expect(revisionSql).toMatch(/referencing old table/i)
    expect(revisionSql).toMatch(/event_tentative_signups/i)
    expect(revisionSql).toMatch(/event_build_role_demands/i)
    expect(revisionSql).toMatch(/event_build_party_assigners/i)
    expect(revisionSql).toMatch(/event_build_applications/i)
    expect(revisionSql).toMatch(/event_regear_participants/i)

    const snapshotBody = revisionSql.slice(
      revisionSql.lastIndexOf('create or replace function public.get_event_state_snapshot'),
    )
    expect(snapshotBody).not.toMatch(/jsonb_agg/i)
    expect(snapshotBody).not.toContain('to_jsonb(e)')
    expect(snapshotBody).toMatch(/e\.state_revision::text/i)
  })

  it('deduplicates slot layout bumps while retaining live assignment invalidation', () => {
    expect(slotRevisionDedupSql).toMatch(
      /drop trigger if exists slots_event_revision_insert/i,
    )
    expect(slotRevisionDedupSql).toMatch(
      /drop trigger if exists slots_event_revision_delete/i,
    )
    expect(slotRevisionDedupSql).toContain('assigned_discord_id')
    expect(slotRevisionDedupSql).toContain('requested_picks')
    expect(slotRevisionDedupSql).toMatch(/is distinct from/i)
    expect(slotRevisionDedupSql).toMatch(/for each statement/i)
  })
})
