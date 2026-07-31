import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '338_reliable_discord_delivery_claims.sql',
  ),
  'utf8',
)

describe('reliable Discord delivery claims migration 338', () => {
  it('claims channel notifications before the external send', () => {
    expect(sql).toContain('create or replace function public.claim_admin_notification_delivery(')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain("v_row.status = 'sent'")
    expect(sql).toContain("v_row.status = 'processing'")
    expect(sql).toContain("'claimToken', v_token")
    expect(sql).toContain('create or replace function public.complete_admin_notification_delivery(')
  })

  it('uses opaque leases and guarded completion for the domain outbox', () => {
    expect(sql).toContain('create or replace function public.claim_domain_outbox(')
    expect(sql).toContain('for update skip locked')
    expect(sql).toContain('claim_token = gen_random_uuid()')
    expect(sql).toContain('create or replace function public.complete_domain_outbox(')
    expect(sql).toMatch(/status = 'processing'[\s\S]*claim_token = p_claim_token/i)
    expect(sql).toMatch(/when p_status = 'failed'[\s\S]*make_interval[\s\S]*power\(2, attempts\)/i)
  })

  it('keeps all delivery RPCs service-role only', () => {
    for (const name of [
      'claim_admin_notification_delivery',
      'complete_admin_notification_delivery',
      'claim_domain_outbox',
      'complete_domain_outbox',
    ]) {
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`, 'i'),
      )
      expect(sql).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`, 'i'),
      )
    }
  })
})
