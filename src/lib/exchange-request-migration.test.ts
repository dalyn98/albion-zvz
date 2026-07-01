import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function migrationSqlFiles(): Array<{ fileName: string; sql: string }> {
  return readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort()
    .map((fileName) => ({
      fileName,
      sql: readFileSync(join(migrationsDir, fileName), 'utf8'),
    }))
}

describe('exchange request migration contract', () => {
  it('keeps the pending exchange unique index scoped by guild_id and discord_id', () => {
    const files = migrationSqlFiles()
    const latestPatch = files.find(({ sql }) =>
      /exchange_requests_one_pending_per_member_per_guild/i.test(sql),
    )

    expect(latestPatch?.fileName).toMatch(/^\d{3}_/)
    expect(latestPatch?.sql).toMatch(/drop\s+index\s+if\s+exists\s+public\.exchange_requests_one_pending_per_user/i)
    expect(latestPatch?.sql).toMatch(
      /create\s+unique\s+index\s+if\s+not\s+exists\s+exchange_requests_one_pending_per_member_per_guild[\s\S]*on\s+public\.exchange_requests\s*\(\s*guild_id\s*,\s*discord_id\s*\)[\s\S]*where\s+status\s*=\s*'pending'/i,
    )
  })
})
