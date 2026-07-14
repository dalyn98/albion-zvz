import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/257_discord_app_login.sql'),
  'utf8',
)

describe('Discord app login migration', () => {
  it('keeps one-time login attempts private, hashed, expiring, and tenant-scoped', () => {
    expect(migrationSql).toContain('create table if not exists public.discord_app_login_attempts')
    expect(migrationSql).toMatch(/guild_id uuid not null references public\.tenants\(id\) on delete cascade/i)
    expect(migrationSql).toMatch(/discord_id text not null check \(char_length\(discord_id\) between 1 and 128\)/i)
    expect(migrationSql).toMatch(/token_hash text not null check \(token_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i)
    expect(migrationSql).toMatch(/expires_at timestamptz not null/i)
    expect(migrationSql).toMatch(/consumed_at timestamptz/i)
    expect(migrationSql).toMatch(/alter table public\.discord_app_login_attempts enable row level security/i)
    expect(migrationSql).toMatch(/revoke all on public\.discord_app_login_attempts from public, anon, authenticated/i)
    expect(migrationSql).toMatch(/grant select, insert, update, delete on public\.discord_app_login_attempts to service_role/i)
  })
})
