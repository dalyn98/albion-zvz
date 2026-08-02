import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/352_guild_home_ownership_disputes.sql'),
  'utf8',
)

describe('migration 352 guild home ownership disputes', () => {
  it('keeps normal onboarding self-serve and limits disputes to actual duplicate links', () => {
    expect(sql).toContain("raise exception 'HOME_GUILD_NOT_CURRENTLY_CLAIMED'")
    expect(sql).toContain("tenant.status in ('pending', 'active')")
    expect(sql).toContain("status in ('submitted', 'under_review')")
    expect(sql).toContain("interval '24 hours'")
  })

  it('does not hide or mutate the incumbent on submission', () => {
    const submit = sql.match(
      /create or replace function public\.submit_guild_home_ownership_dispute[\s\S]*?\n\$\$;/i,
    )?.[0] ?? ''
    expect(submit).not.toContain('change_guild_feature_state')
    expect(submit).not.toMatch(/update public\.app_settings/i)
    expect(submit).not.toMatch(/update public\.tenants/i)
  })

  it('requires explicit review before resolution and purges evidence on close', () => {
    const review = sql.match(
      /create or replace function public\.review_guild_home_ownership_dispute[\s\S]*?\n\$\$;/i,
    )?.[0] ?? ''
    expect(review).toContain("v_dispute.status <> 'under_review'")
    expect(review).toContain('evidence_summary = null')
    expect(review).toContain('evidence_purged_at = now()')
    expect(review).toContain('HOME_GUILD_DISPUTE_RESOLUTION_NOTE_REQUIRED')
  })

  it('reassigns only the home-guild link and resets the old public profile', () => {
    const review = sql.match(
      /create or replace function public\.review_guild_home_ownership_dispute[\s\S]*?\n\$\$;/i,
    )?.[0] ?? ''
    expect(review).toContain("'albion_home_guild_id', ''")
    expect(review).toContain("'public_guild_profile'")
    expect(review).toContain("'setup_required'")
    for (const forbidden of [
      'regear_requests',
      'point_ledger',
      'events',
      'shop_orders',
      'guild_member_records',
    ]) {
      expect(review).not.toContain(forbidden)
    }
  })

  it('blocks direct table writes and exposes commands only to service role', () => {
    expect(sql).toMatch(
      /revoke all on table public\.guild_home_ownership_disputes[\s\S]*from public, anon, authenticated, service_role/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.submit_guild_home_ownership_dispute[\s\S]*to service_role/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.review_guild_home_ownership_dispute[\s\S]*to service_role/i,
    )
  })
})
