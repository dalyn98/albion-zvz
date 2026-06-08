import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/214_search_console_performance.sql'),
  'utf8',
)

describe('search console performance migration', () => {
  it('creates Search Console sync, page, query, and index inspection tables', () => {
    expect(migrationSql).toContain('create table if not exists public.seo_search_console_sync_runs')
    expect(migrationSql).toContain('create table if not exists public.seo_search_console_daily_pages')
    expect(migrationSql).toContain('create table if not exists public.seo_search_console_daily_queries')
    expect(migrationSql).toContain('create table if not exists public.seo_index_inspections')
  })

  it('uses stable natural keys that match upsert conflict targets', () => {
    expect(migrationSql).toMatch(/primary key \(date, page_path\)/i)
    expect(migrationSql).toMatch(/primary key \(date, page_path, query, country, device\)/i)
    expect(migrationSql).toMatch(/inspected_url text primary key/i)
  })

  it('keeps the new SEO data service-role-only', () => {
    for (const table of [
      'seo_search_console_sync_runs',
      'seo_search_console_daily_pages',
      'seo_search_console_daily_queries',
      'seo_index_inspections',
    ]) {
      expect(migrationSql).toContain(`alter table public.${table} enable row level security`)
      expect(migrationSql).toContain(`revoke all on public.${table} from anon, authenticated`)
      expect(migrationSql).toContain(`grant select, insert, update, delete on public.${table} to service_role`)
    }
  })
})
