import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const schemaSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '315_guild_member_record_schema.sql'),
  'utf8',
)
const backfillSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '316_guild_member_record_backfill.sql'),
  'utf8',
)
const dualWriteSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '317_guild_member_record_dual_write.sql'),
  'utf8',
)

describe('guild member record Phase 2A migrations', () => {
  it('separates stable members, access identities, character periods, and conflicts', () => {
    expect(schemaSql).toContain('create table if not exists public.guild_member_records')
    expect(schemaSql).toContain(
      'create table if not exists public.guild_member_access_identities',
    )
    expect(schemaSql).toContain(
      'create table if not exists public.guild_character_memberships',
    )
    expect(schemaSql).toContain(
      'create table if not exists public.guild_member_identity_conflicts',
    )
    expect(schemaSql).toMatch(
      /identity_type text not null[\s\S]*identity_type in \('discord', 'local'\)/i,
    )
    expect(schemaSql).toMatch(
      /unique \(guild_id, identity_type, subject_id\)/i,
    )
  })

  it('uses tenant-composite foreign keys for every member-owned row', () => {
    expect(schemaSql).toMatch(
      /guild_member_access_identities_guild_member_fkey[\s\S]*foreign key \(guild_id, guild_member_id\)[\s\S]*references public\.guild_member_records\(guild_id, id\)/i,
    )
    expect(schemaSql).toMatch(
      /guild_character_memberships_guild_member_fkey[\s\S]*foreign key \(guild_id, guild_member_id\)[\s\S]*references public\.guild_member_records\(guild_id, id\)/i,
    )
    expect(schemaSql).toMatch(
      /guild_member_identity_conflicts_member_fkey[\s\S]*foreign key \(guild_id, guild_member_id\)[\s\S]*references public\.guild_member_records\(guild_id, id\)/i,
    )
  })

  it('enforces one active official Albion character globally without using nickname', () => {
    const index = schemaSql.match(
      /create unique index if not exists guild_character_memberships_one_active_guild[\s\S]*?where ended_at is null;/i,
    )?.[0]
    expect(index).toBeDefined()
    expect(index).toContain('(albion_server, albion_player_id)')
    expect(index).not.toContain('albion_player_name')
    expect(schemaSql).toContain(
      "check (char_length(btrim(albion_player_id)) between 1 and 80)",
    )
  })

  it('keeps identity tables service-role only and RLS enabled', () => {
    for (const table of [
      'guild_member_records',
      'guild_member_access_identities',
      'guild_character_memberships',
      'guild_member_identity_conflicts',
    ]) {
      expect(schemaSql).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      )
      expect(schemaSql).toMatch(
        new RegExp(
          `revoke all on public\\.${table} from public, anon, authenticated`,
          'i',
        ),
      )
    }
    expect(schemaSql).toMatch(
      /revoke all on function public\.sync_guild_character_membership[\s\S]*from public, anon, authenticated/i,
    )
  })

  it('backfills deterministically and never picks a winner for ambiguous active evidence', () => {
    expect(backfillSql).toContain(
      'create or replace function public.backfill_guild_member_records()',
    )
    expect(backfillSql).toContain('ambiguous_legacy_active_character')
    expect(backfillSql).toMatch(
      /where is_active[\s\S]*having count\(\*\) > 1/i,
    )
    expect(backfillSql).toMatch(
      /if v_row\.is_active and v_row\.claimant_count is not null then[\s\S]*continue;/i,
    )
    expect(backfillSql).toContain(
      "'legacy-guild-character-membership'",
    )
    expect(backfillSql).toContain('on conflict (id) do update')
    expect(backfillSql).toContain('legacy_character_source_mismatch')
    expect(backfillSql).toContain('disputed_character_claim')
  })

  it('dual-writes every existing membership path and extends account merge only', () => {
    expect(dualWriteSql).toMatch(
      /after insert or update on public\.guild_avatars[\s\S]*dual_write_guild_avatar_member_record/i,
    )
    expect(dualWriteSql).toMatch(
      /after insert or update on public\.guild_local_accounts[\s\S]*dual_write_local_guild_account_member_record/i,
    )
    expect(dualWriteSql).toMatch(
      /after insert or update on public\.account_albion_tenant_links[\s\S]*dual_write_account_albion_tenant_link_member_record/i,
    )
    expect(dualWriteSql).toContain(
      'rename to merge_member_accounts_before_guild_member_records',
    )
    expect(dualWriteSql).toContain('public.merge_guild_member_records(')
    expect(dualWriteSql).toContain('select public.backfill_guild_member_records()')
  })

  it('does not cut over or alter legacy business ownership tables', () => {
    const combined = `${schemaSql}\n${backfillSql}\n${dualWriteSql}`.toLowerCase()
    for (const table of [
      'point_ledger',
      'regear_requests',
      'events',
      'slots',
      'exchange_requests',
      'donation_requests',
      'shop_orders',
      'craft_tasks',
    ]) {
      expect(combined).not.toContain(`alter table public.${table}`)
    }
    expect(combined).not.toContain('drop column discord_id')
  })
})
