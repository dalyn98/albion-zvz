import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/262_atomic_party_slot_save.sql'),
  'utf8',
)

describe('atomic party slot save migration', () => {
  it('serializes and atomically replaces one tenant party slot layout', () => {
    expect(migrationSql).toMatch(/create or replace function public\.save_party_slots_atomic/i)
    expect(migrationSql).toMatch(/pg_advisory_xact_lock/i)
    expect(migrationSql).toMatch(/create trigger trg_bump_party_slots_version_update/i)
    expect(migrationSql).toMatch(/order by id\s+for update[\s\S]*select slots_version/i)
    expect(migrationSql).toMatch(/set_config\('app\.atomic_party_slot_save', '1', true\)/i)
    expect(migrationSql).toMatch(/and slots_version = v_current_version[\s\S]*raise exception 'PARTY_SLOTS_STALE'/i)
    expect(migrationSql).toMatch(/set constraints slots_guild_party_slot_number_key deferred/i)
    expect(migrationSql).toMatch(/where guild_id = p_guild_id/i)
    expect(migrationSql).toMatch(/raise exception 'PARTY_SLOTS_STALE'/i)
    expect(migrationSql).toMatch(/grant execute on function public\.save_party_slots_atomic[\s\S]*to service_role/i)
    expect(migrationSql).toMatch(/revoke all on function public\.save_party_slots_atomic[\s\S]*from anon, authenticated/i)
  })
})
