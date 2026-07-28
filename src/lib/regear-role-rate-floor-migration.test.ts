import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('regear Discord role rate floor migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/292_regear_discord_role_rate_floors.sql'),
    'utf8',
  )

  it('creates a tenant-scoped role-rate table with bounded rates', () => {
    expect(sql).toContain('create table if not exists public.regear_discord_role_rate_floors')
    expect(sql).toContain('guild_id uuid not null references public.tenants(id) on delete cascade')
    expect(sql).toContain('unique (guild_id, discord_role_id)')
    expect(sql).toContain(
      'minimum_payout_rate_percent >= 1 and minimum_payout_rate_percent <= 1000',
    )
  })

  it('enables RLS and limits direct table access to service_role', () => {
    expect(sql).toContain(
      'alter table public.regear_discord_role_rate_floors enable row level security',
    )
    expect(sql).toMatch(
      /grant select, insert, update, delete\s+on public\.regear_discord_role_rate_floors\s+to service_role/,
    )
  })
})
