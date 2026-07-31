import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/340_experimental_tactics_private_shares.sql',
  ),
  'utf8',
)

describe('experimental tactics private sharing migration', () => {
  it('preserves tenants with existing tactic data without enabling unused tenants', () => {
    expect(sql).toMatch(
      /select board\.guild_id from public\.tactic_boards[\s\S]*union[\s\S]*select snapshot\.guild_id from public\.event_tactic_snapshots/i,
    )
    expect(sql).toContain("'tactics_experimental_enabled', 'true'")
    expect(sql).toMatch(/on conflict \(guild_id, key\) do nothing/i)
    expect(sql).not.toMatch(/from public\.tenants\s+tenant/i)
  })

  it('gives legacy links a finite transition and requires expiry thereafter', () => {
    expect(sql).toMatch(
      /update public\.tactic_share_links[\s\S]*interval '7 days'[\s\S]*where link\.expires_at is null/i,
    )
    expect(sql).toMatch(/alter column expires_at set not null/i)
    expect(sql).toMatch(/check \(expires_at > created_at\)/i)
  })

  it('keeps tactic tables service-only behind RLS', () => {
    for (const table of [
      'tactic_boards',
      'tactic_steps',
      'tactic_share_links',
    ]) {
      expect(sql).toContain(
        `revoke all on table public.${table} from public, anon, authenticated`,
      )
      expect(sql).toContain(
        `grant select, insert, update, delete on table public.${table} to service_role`,
      )
    }
    expect(sql).toMatch(
      /revoke all on function public\.issue_tactic_share_link[\s\S]*public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.issue_tactic_share_link[\s\S]*to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.revoke_tactic_share_link[\s\S]*public, anon, authenticated/i,
    )
  })

  it('issues atomically only for enabled tenants and revokes idempotently', () => {
    expect(sql).toMatch(
      /create or replace function public\.issue_tactic_share_link[\s\S]*tactics_experimental_enabled[\s\S]*update public\.tactic_boards[\s\S]*insert into public\.tactic_share_links/i,
    )
    expect(sql).toMatch(
      /p_expires_at > v_now \+ interval '8 days'/i,
    )
    expect(sql).toMatch(
      /create or replace function public\.revoke_tactic_share_link[\s\S]*set revoked_at = coalesce\(link\.revoked_at, clock_timestamp\(\)\)/i,
    )
  })

  it('prevents disabled then re-enabled tenants from reviving old links', () => {
    expect(sql).toMatch(
      /create or replace function public\.revoke_tactic_shares_when_disabled[\s\S]*new\.key = 'tactics_experimental_enabled'[\s\S]*new\.value is distinct from 'true'[\s\S]*set revoked_at = coalesce/i,
    )
    expect(sql).toMatch(
      /create trigger revoke_tactic_shares_when_disabled[\s\S]*after insert or update of value on public\.app_settings/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.revoke_tactic_shares_when_disabled\(\)[\s\S]*public, anon, authenticated, service_role/i,
    )
  })
})
