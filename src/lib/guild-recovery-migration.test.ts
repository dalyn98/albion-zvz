import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(
  new URL('../../supabase/migrations/303_guild_recovery_schema.sql', import.meta.url),
  'utf8',
)
const commands = readFileSync(
  new URL('../../supabase/migrations/304_guild_recovery_commands.sql', import.meta.url),
  'utf8',
)
const actions = readFileSync(
  new URL('../app/actions/guild-backup.ts', import.meta.url),
  'utf8',
)

describe('same-guild recovery migration contract', () => {
  it('pins a per-workspace logical Albion guild identity and protects receipts', () => {
    expect(schema).toMatch(
      /create table if not exists public\.guild_recovery_identities[\s\S]*guild_id uuid primary key/i,
    )
    expect(schema).toMatch(
      /create table if not exists public\.guild_recovery_runs[\s\S]*unique\s*\(\s*guild_id\s*,\s*idempotency_key\s*\)/i,
    )
    expect(schema).toMatch(
      /create table if not exists public\.guild_recovery_exports[\s\S]*manifest_sha256/i,
    )
    expect(schema).toMatch(
      /alter table public\.guild_recovery_identities enable row level security/i,
    )
    expect(schema).toMatch(
      /alter table public\.guild_recovery_exports enable row level security/i,
    )
    expect(schema).toMatch(
      /alter table public\.guild_recovery_runs enable row level security/i,
    )
    expect(schema).toMatch(
      /revoke all on public\.guild_recovery_runs from public, anon, authenticated/i,
    )
  })

  it('exports only explicit current-state domains with workspace and logical identity', () => {
    expect(commands).toContain("'sourceWorkspaceId', p_guild_id")
    expect(commands).toContain("'sourceAlbionGuildId', v_albion_guild_id")
    expect(commands).toContain("'pointBalances'")
    expect(commands).toContain("'pointEscrows'")
    expect(commands).toContain("'shopOrders'")
    expect(commands).toContain("'craftTasks'")
    expect(commands).toContain("'tradeOrders'")

    const exportBody = commands.slice(
      commands.indexOf('create or replace function public.export_guild_recovery_state'),
      commands.indexOf('create or replace function public.guild_recovery_state_summary'),
    )
    expect(exportBody).not.toContain('event_templates')
    expect(exportBody).not.toContain('slot_templates')
    expect(exportBody).not.toContain('admin_roles')
    expect(exportBody).not.toContain('notifications')
  })

  it('rejects cross-workspace and cross-logical-guild previews before mutation', () => {
    const previewBody = commands.slice(
      commands.indexOf('create or replace function public.preview_guild_recovery_manifest'),
      commands.indexOf('create or replace function public.restore_guild_recovery_manifest'),
    )
    expect(previewBody).toContain(
      "p_manifest#>>'{source,workspaceId}' <> p_guild_id::text",
    )
    expect(previewBody).toContain(
      "p_manifest#>>'{source,albionGuildId}' <>",
    )
    expect(previewBody).toContain('GUILD_RECOVERY_SOURCE_MISMATCH')
    expect(previewBody).toContain('public.guild_recovery_exports')
    expect(previewBody).toContain('GUILD_RECOVERY_EXPORT_NOT_RECOGNIZED')
    expect(commands).toMatch(
      /restore_guild_recovery_manifest[\s\S]*perform public\.preview_guild_recovery_manifest/i,
    )
  })

  it('stores the safety snapshot before one transactional restore and writes an audit diff', () => {
    const restoreBody = commands.slice(
      commands.indexOf('create or replace function public.restore_guild_recovery_manifest'),
      commands.indexOf('create or replace function public.import_guild_template_package'),
    )
    const runInsert = restoreBody.indexOf('insert into public.guild_recovery_runs')
    const firstDomainMutation = restoreBody.indexOf('update public.exchange_requests')

    expect(runInsert).toBeGreaterThan(0)
    expect(firstDomainMutation).toBeGreaterThan(runInsert)
    expect(restoreBody).toContain('v_before_export')
    expect(restoreBody).toContain('safety_snapshot')
    expect(restoreBody).toContain('pg_advisory_xact_lock')
    expect(restoreBody).toContain('idempotency_key')
    expect(restoreBody).toContain("'backup.import'")
    expect(restoreBody).toContain("'diff', v_diff")
    expect(restoreBody).toContain("'guild_recovery_restore'")
    expect(restoreBody).not.toMatch(/\bcommit\b/i)
    expect(restoreBody).toContain(
      'on conflict (guild_id, unique_name, enchant)',
    )
    expect(restoreBody).not.toContain(
      'on conflict (guild_id, unique_name, enchant, quality)',
    )
    expect(commands).toMatch(
      /create or replace function public\.guild_recovery_state_summary[\s\S]*language plpgsql\s+stable/i,
    )
    expect(commands).toMatch(
      /create or replace function public\.guild_recovery_state_diff[\s\S]*language plpgsql\s+stable/i,
    )
  })

  it('uses one apply RPC from the action instead of sequential domain writes', () => {
    expect(actions).toContain('applyGuildRecovery')
    expect(actions).toContain('importGuildRecoveryAction')
    expect(actions).not.toContain('applyPointAdjustments')
    expect(actions).not.toContain('applyEventTemplates')
    expect(actions).not.toContain('applyInventory')
    expect(commands).toMatch(
      /grant execute on function public\.restore_guild_recovery_manifest[\s\S]*to service_role/i,
    )
  })

  it('keeps cross-guild template sharing in a finance-free package command', () => {
    const templateBody = commands.slice(
      commands.indexOf('create or replace function public.import_guild_template_package'),
    )
    expect(commands).toContain(
      'create or replace function public.guild_template_package_has_sensitive_keys',
    )
    expect(templateBody).toContain("array['events', 'slots']")
    expect(templateBody).toContain(
      'public.guild_template_package_has_sensitive_keys',
    )
    expect(templateBody).toContain('public.event_templates')
    expect(templateBody).toContain('public.slot_templates')
    expect(templateBody).not.toContain('point_ledger')
    expect(templateBody).not.toContain('guild_avatars')
    expect(templateBody).not.toContain('shop_inventory')
  })
})
