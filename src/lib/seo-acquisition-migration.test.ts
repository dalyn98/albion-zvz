import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/213_seo_acquisition_attribution.sql'),
  'utf8',
)

describe('seo acquisition attribution migration', () => {
  it('creates service-role-only attribution tables with RLS enabled', () => {
    expect(migrationSql).toContain('create table if not exists public.seo_sessions')
    expect(migrationSql).toContain('create table if not exists public.seo_events')
    expect(migrationSql).toContain('create table if not exists public.tenant_acquisition_sources')
    expect(migrationSql).toContain('alter table public.seo_sessions enable row level security')
    expect(migrationSql).toContain('alter table public.seo_events enable row level security')
    expect(migrationSql).toContain(
      'alter table public.tenant_acquisition_sources enable row level security',
    )
    expect(migrationSql).toContain('revoke all on public.seo_sessions from anon, authenticated')
    expect(migrationSql).toContain('revoke all on public.seo_events from anon, authenticated')
    expect(migrationSql).toContain(
      'revoke all on public.tenant_acquisition_sources from anon, authenticated',
    )
  })

  it('stores first-touch snapshots and a once-only tenant acquisition link', () => {
    expect(migrationSql).toMatch(/visitor_id uuid not null unique/i)
    expect(migrationSql).toMatch(/first_landing_path text not null/i)
    expect(migrationSql).toMatch(/first_utm jsonb not null default '\{\}'::jsonb/i)
    expect(migrationSql).toMatch(/tenant_id uuid primary key references public\.tenants\(id\)/i)
    expect(migrationSql).toMatch(/seo_session_id uuid references public\.seo_sessions\(id\)/i)
  })

  it('allowlists the event taxonomy at the database boundary', () => {
    for (const eventType of [
      'landing_view',
      'feature_card_click',
      'cta_demo_click',
      'cta_docs_click',
      'cta_bot_install_click',
      'language_switch',
      'discord_oauth_start',
      'bot_install_start',
    ]) {
      expect(migrationSql).toContain(`'${eventType}'`)
    }
  })
})
