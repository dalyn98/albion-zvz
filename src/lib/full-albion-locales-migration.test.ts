import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_LOCALES } from '@/i18n/locales'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/411_full_albion_locales.sql'),
  'utf8',
)

describe('migration 411 full Albion locales', () => {
  it('keeps every persisted locale constraint aligned with the app contract', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(sql).toContain(`quote_literal('${locale}')`)
      expect(sql).toMatch(new RegExp(`'${locale.replace('-', '\\-')}'`))
    }

    for (const [table, column] of [
      ['guild_avatars', 'preferred_language'],
      ['guests', 'preferred_language'],
      ['event_guest_profiles', 'preferred_language'],
      ['global_access_preferences', 'preferred_language'],
      ['seo_sessions', 'first_locale'],
      ['seo_events', 'locale'],
      ['tenant_acquisition_sources', 'first_locale'],
      ['seo_search_console_daily_pages', 'locale'],
      ['seo_search_console_daily_queries', 'locale'],
      ['seo_index_inspections', 'locale'],
      ['support_tickets', 'opener_locale'],
    ]) {
      expect(sql).toContain(`('${table}', '${column}')`)
    }
  })

  it('updates both service-only RPC validation boundaries', () => {
    expect(sql).toMatch(
      /create or replace function public\.set_global_access_preferences[\s\S]*'es-419'[\s\S]*GLOBAL_PREFERENCE_LANGUAGE_INVALID/i,
    )
    expect(sql).toMatch(
      /create or replace function public\.reserve_support_ticket[\s\S]*'zh-Hant'[\s\S]*invalid_support_ticket_input/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.set_global_access_preferences[\s\S]*from public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.reserve_support_ticket[\s\S]*from public, anon, authenticated/i,
    )
  })
})
