import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/323_verified_character_membership_transfer.sql',
  ),
  'utf8',
)

describe('verified character membership transfer migration', () => {
  it('requires authoritative trusted home-guild evidence and preserves ambiguity', () => {
    expect(sql).toContain("v_relation = 'home_guild'")
    expect(sql).toContain("v_trust_status = 'trusted'")
    expect(sql).toContain(
      "v_source = 'dual_write_account_albion_link'",
    )
    expect(sql).toContain(
      "conflict.conflict_type = 'ambiguous_legacy_active_character'",
    )
    expect(sql).toContain("conflict.status = 'unresolved'")
    expect(sql).toMatch(
      /account_albion_tenant_links link[\s\S]*guild_member_access_identities access[\s\S]*member\.status = 'active'/,
    )
  })

  it('ends the previous period without moving business ownership', () => {
    expect(sql).toContain("ended_reason = 'character_transferred'")
    expect(sql).toMatch(
      /update public\.guild_member_records[\s\S]*status = 'withdrawn'/,
    )
    expect(sql).toMatch(
      /update public\.guild_member_access_identities[\s\S]*revoked_at/,
    )
    expect(sql).toMatch(/update public\.guild_avatars[\s\S]*withdrawn_at/)
    expect(sql).toMatch(
      /update public\.account_albion_tenant_links[\s\S]*status_reason = 'character_transferred'/,
    )
    expect(sql).not.toMatch(
      /update public\.(point_ledger|slots|regear_requests|event_participation_closeout_entries|craft_tasks|shop_orders)/,
    )
  })

  it('records both directions, resolves only the transfer conflict, and hides internals', () => {
    expect(sql).toContain("'member.character.transfer_out'")
    expect(sql).toContain("'member.character.transfer_in'")
    expect(sql).toContain("'character_transfer_out'")
    expect(sql).toContain("'character_transfer_in'")
    expect(sql).toContain(
      "conflict.conflict_type = 'character_active_elsewhere'",
    )
    expect(sql).toContain(
      "'resolution', 'verified_home_guild_transfer'",
    )
    expect(sql).toMatch(
      /revoke all on function public\.sync_guild_character_membership_before_verified_transfer[\s\S]*service_role/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.sync_guild_character_membership[\s\S]*to service_role/i,
    )
  })
})
