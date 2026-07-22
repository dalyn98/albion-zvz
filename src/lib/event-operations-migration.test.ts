import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/278_event_operations.sql'),
  'utf8',
)

describe('event operations migration', () => {
  it('keeps tactic snapshots immutable and scoped to one guild event', () => {
    expect(migrationSql).toContain('create unique index if not exists events_guild_id_id_unique')
    expect(migrationSql).toContain('create table if not exists public.event_tactic_snapshots')
    expect(migrationSql).toContain('create table if not exists public.event_tactic_snapshot_steps')
    expect(migrationSql).toContain('foreign key (guild_id, event_id)')
    expect(migrationSql).toContain('references public.events(guild_id, id)')
    expect(migrationSql).toContain('foreign key (guild_id, source_board_id)')
    expect(migrationSql).toContain('references public.tactic_boards(guild_id, id)')
    expect(migrationSql).toContain('unique (guild_id, event_id)')
    expect(migrationSql).toContain('foreign key (guild_id, snapshot_id)')
  })

  it('captures a published tactic atomically only before battle start', () => {
    expect(migrationSql).toMatch(/capture_event_tactic_snapshot\s*\(/i)
    expect(migrationSql).toMatch(/e\.guild_id\s*=\s*p_guild_id/i)
    expect(migrationSql).toMatch(/b\.guild_id\s*=\s*p_guild_id/i)
    expect(migrationSql).toMatch(/b\.status\s*=\s*'published'/i)
    expect(migrationSql).toMatch(/battle_started_at\s+is\s+not\s+null/i)
    expect(migrationSql).toContain("event_tactic_not_combat")
    expect(migrationSql).toMatch(/for update of e/i)
    expect(migrationSql).toMatch(/select\s+to_jsonb\(b\),\s+coalesce\(\s*jsonb_agg\(to_jsonb\(step\)/i)
    expect(migrationSql).not.toMatch(/lock table public\.tactic_steps/i)
    expect(migrationSql).toMatch(/insert into public\.event_tactic_snapshot_steps[\s\S]*jsonb_populate_recordset\(null::public\.tactic_steps, v_steps\)/i)
  })

  it('stores bounded AAR content behind service-role RLS', () => {
    expect(migrationSql).toContain('create table if not exists public.event_after_action_reviews')
    expect(migrationSql).toContain('event_after_action_reviews_summary_len')
    expect(migrationSql).toContain('event_after_action_reviews_wins_array')
    expect(migrationSql).toContain('event_after_action_reviews_issues_array')
    expect(migrationSql).toContain('event_after_action_reviews_action_items_array')
    expect(migrationSql).toContain('alter table public.event_after_action_reviews enable row level security')
    expect(migrationSql).toMatch(/grant select, insert, update, delete[\s\S]*to service_role/i)
  })

  it('does not expose operational writes to browser roles', () => {
    expect(migrationSql).toMatch(/revoke all on function public\.capture_event_tactic_snapshot[\s\S]*from public, anon, authenticated/i)
    expect(migrationSql).toMatch(/grant execute on function public\.capture_event_tactic_snapshot[\s\S]*to service_role/i)
    expect(migrationSql).toContain('alter table public.event_tactic_snapshots enable row level security')
    expect(migrationSql).toContain('alter table public.event_tactic_snapshot_steps enable row level security')
  })

  it('clears an assigned tactic atomically only before battle start', () => {
    expect(migrationSql).toMatch(/clear_event_tactic_snapshot\s*\(/i)
    expect(migrationSql).toMatch(/delete from public\.event_tactic_snapshots[\s\S]*guild_id\s*=\s*p_guild_id[\s\S]*event_id\s*=\s*p_event_id/i)
    expect(migrationSql).toMatch(/revoke all on function public\.clear_event_tactic_snapshot[\s\S]*from public, anon, authenticated/i)
    expect(migrationSql).toMatch(/grant execute on function public\.clear_event_tactic_snapshot[\s\S]*to service_role/i)
  })
})
