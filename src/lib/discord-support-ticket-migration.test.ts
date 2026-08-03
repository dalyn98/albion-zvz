import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/365_support_ticket_threads.sql'),
  'utf8',
)

describe('support ticket migration', () => {
  it('keeps platform support tables service-role only', () => {
    for (const table of ['support_ticket_settings', 'support_tickets', 'support_ticket_events']) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'))
    }
  })

  it('prevents duplicate active tickets and duplicate interaction effects', () => {
    expect(sql).toMatch(/support_tickets_one_active_per_opener[\s\S]*where status in/i)
    expect(sql).toMatch(/support_ticket_events_interaction_unique[\s\S]*interaction_id/i)
    expect(sql).toContain('pg_advisory_xact_lock')
  })

  it('keeps all mutation RPCs fixed-path and service-only', () => {
    for (const name of [
      'reserve_support_ticket',
      'finalize_support_ticket',
      'mark_support_ticket_provision_failed',
      'transition_support_ticket',
    ]) {
      expect(sql).toMatch(new RegExp(`function public\\.${name}\\([\\s\\S]*security definer[\\s\\S]*set search_path = public`, 'i'))
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*from public, anon, authenticated`, 'i'))
    }
  })
})
