import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '349_system_notice_contract.sql'),
  'utf8',
)

describe('system notice safety contract migration', () => {
  it('requires typed, expiring content and normalizes every legacy open row', () => {
    expect(sql).toMatch(/alter column expires_at set not null/i)
    expect(sql).toContain("purpose in ('incident', 'maintenance', 'security')")
    expect(sql).toContain("severity in ('important', 'critical')")
    expect(sql).toMatch(
      /set archived_at = now\(\)[\s\S]*archived_at is null[\s\S]*expires_at <= now\(\)/i,
    )
    expect(sql).toMatch(
      /create unique index if not exists super_admin_notices_single_open_idx[\s\S]*where archived_at is null/i,
    )
  })

  it('serializes replacement and commits the notice plus bounded audit metadata atomically', () => {
    expect(sql).toContain('create or replace function public.replace_super_admin_notice')
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('super-admin-notice-active', 0))")
    expect(sql).toMatch(
      /update public\.super_admin_notices[\s\S]*where archived_at is null;[\s\S]*insert into public\.super_admin_notices[\s\S]*insert into public\.super_admin_audit_log/i,
    )
    expect(sql).toContain("'notice.replace'")
    const auditPayload = sql.match(
      /'notice\.replace',[\s\S]*?jsonb_build_object\(([\s\S]*?)\)\s*\);/i,
    )?.[1]
    expect(auditPayload).toBeDefined()
    expect(auditPayload).not.toContain('v_message')
    expect(auditPayload).toContain("'replacedCount'")
  })

  it('archives idempotently and removes direct service-role mutation access', () => {
    expect(sql).toContain('create or replace function public.archive_super_admin_notice')
    expect(sql).toMatch(/where id = p_notice_id[\s\S]*and archived_at is null/i)
    expect(sql).toMatch(
      /revoke insert, update, delete, truncate[\s\S]*on public\.super_admin_notices from service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.replace_super_admin_notice[\s\S]*from public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.replace_super_admin_notice[\s\S]*to service_role/i,
    )
    expect(sql).toMatch(
      /revoke all on function public\.archive_super_admin_notice\(uuid, text\)[\s\S]*from public, anon, authenticated/i,
    )
  })
})
