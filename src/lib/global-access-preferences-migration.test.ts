import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/351_global_access_preferences.sql'),
  'utf8',
)

describe('migration 351 global access preferences', () => {
  it('keys personal preferences by Discord access identity, not guild', () => {
    expect(sql).toMatch(
      /create table if not exists public\.global_access_preferences[\s\S]*primary key \(provider, subject\)/i,
    )
    const table = sql.match(
      /create table if not exists public\.global_access_preferences[\s\S]*?\n\);/i,
    )?.[0] ?? ''
    expect(table).not.toContain('guild_id')
  })

  it('does not choose between conflicting legacy guild preferences', () => {
    expect(sql).toMatch(
      /count\(distinct preferred_language\)[\s\S]*= 1[\s\S]*then min\(preferred_language\)[\s\S]*else null/i,
    )
    expect(sql).toMatch(
      /count\(distinct timezone\)[\s\S]*= 1[\s\S]*then min\(timezone\)[\s\S]*else null/i,
    )
    expect(sql).toContain('global_access_preference_conflicts')
    expect(sql).toContain("status = 'unresolved'")
  })

  it('keeps direct tables private and exposes only the self-scoped service command', () => {
    expect(sql).toMatch(
      /revoke all on table public\.global_access_preferences[\s\S]*from public, anon, authenticated, service_role/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.set_global_access_preferences[\s\S]*to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.project_global_access_preferences\(text\)[\s\S]*service_role/i,
    )
  })

  it('projects an explicit choice to legacy notification readers across guilds', () => {
    expect(sql).toMatch(
      /update public\.guild_avatars[\s\S]*where discord_id = p_subject/i,
    )
    expect(sql).toMatch(
      /update public\.guests[\s\S]*where discord_id = p_subject/i,
    )
    expect(sql).toContain('pg_trigger_depth() > 1')
  })
})
