import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readMigration(fileName: string): string {
  return readFileSync(
    join(process.cwd(), 'supabase/migrations', fileName),
    'utf8',
  )
}

describe('delayed killboard recovery migrations', () => {
  it('indexes tenant-scoped killboard ingestion-time hints', () => {
    const sql = readMigration('270_killboard_event_ingestion_hints_index.sql')

    expect(sql).toMatch(/create index if not exists/i)
    expect(sql).toMatch(
      /on public\.killboard_events\s*\(\s*guild_id\s*,\s*created_at\s+desc\s*\)\s*where battle_id is not null/i,
    )
  })

  it('restores only the two missing Menhera ZvZ battles idempotently', () => {
    const sql = readMigration('271_restore_menhera_participation_battles.sql')

    expect(sql).toContain("where t.slug = 'menhera'")
    expect(sql).toMatch(/albion_battle_id\s+in\s*\(490635697,\s*490643714\)/i)
    expect(sql).toContain("bvp.relation_scope = 'direct'")
    expect(sql).toContain("bvp.activity_kind = 'zvz'")
    expect(sql).toMatch(
      /on conflict \(guild_id, battle_record_id, main_opponent_force_key\)\s+do nothing/i,
    )
  })
})
