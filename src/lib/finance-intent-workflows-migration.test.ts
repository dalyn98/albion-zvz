import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/336_finance_intent_workflows.sql'),
  'utf8',
)

describe('finance intent workflow migration', () => {
  it('holds exchange points and exposes only service-role mutation functions', () => {
    expect(sql).toContain('held_points integer not null default 0')
    expect(sql).toContain("request.hold_status = 'held'")
    for (const signature of [
      'submit_exchange_request(uuid, text, text, integer)',
      'update_exchange_request_hold(uuid, uuid, text, integer)',
      'cancel_exchange_request(uuid, uuid, text)',
      'allocate_treasury_deposit(uuid, uuid, text, text, text, text, uuid)',
      'grant_special_reward(uuid, text[], integer, text, text, text, uuid, text)',
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from anon, authenticated`)
      expect(sql).toContain(`grant execute on function public.${signature} to service_role`)
    }
  })

  it('keeps raw treasury evidence separate from member-authored purpose', () => {
    expect(sql).toContain('create table if not exists public.guild_treasury_deposits')
    expect(sql).toContain('create table if not exists public.treasury_deposit_allocations')
    expect(sql).toContain("purpose in ('point_top_up', 'guild_donation', 'other')")
    const rawEvidenceTable = sql.match(
      /create table if not exists public\.guild_treasury_deposits\s*\(([\s\S]*?)\n\);/i,
    )?.[1]
    expect(rawEvidenceTable).toBeDefined()
    expect(rawEvidenceTable).not.toMatch(/\bpurpose\s+text/i)
  })

  it('uses a dedicated special reward batch and capability without changing old bit meanings', () => {
    expect(sql).toContain('create table if not exists public.special_reward_grants')
    expect(sql).toContain('create table if not exists public.special_reward_grant_members')
    expect(sql).toContain("p_confirmation <> 'SPECIAL REWARD'")
    expect(sql).toContain('274877906943')
  })
})
