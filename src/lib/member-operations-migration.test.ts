import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/280_member_operations.sql',
)

describe('member operations migration', () => {
  it('ships tenant-scoped trial and absence tables', () => {
    expect(existsSync(migrationPath)).toBe(true)
    if (!existsSync(migrationPath)) return
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create table if not exists public.member_trial_profiles')
    expect(sql).toContain('create table if not exists public.member_absences')
    expect(sql).toContain('foreign key (guild_id, discord_id)')
    expect(sql).toContain('references public.guild_avatars(guild_id, discord_id)')
    expect(sql).toContain("status in ('trial', 'accepted', 'rejected')")
    expect(sql).toContain("ends_on >= starts_on")
    expect(sql).toContain('create or replace function public.create_member_absence')
    expect(sql).toContain('p_today date')
    expect(sql).toContain('ends_on >= p_today')
    expect(sql).toContain('p_ends_on < p_today')
    expect(sql).not.toContain('p_starts_on < p_today')
    expect(sql).not.toContain('ends_on >= current_date')
    expect(sql).toContain('for update')
    expect(sql).toContain("raise exception 'ABSENCE_OVERLAP'")
    expect(sql).toContain('create or replace function public.save_member_trial')
    expect(sql).toMatch(
      /when member_trial_profiles\.status = excluded\.status[\s\S]*member_trial_profiles\.resolved_at/i,
    )
  })

  it('keeps both tables service-role only behind RLS', () => {
    if (!existsSync(migrationPath)) return
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('alter table public.member_trial_profiles enable row level security')
    expect(sql).toContain('alter table public.member_absences enable row level security')
    expect(sql).toMatch(/revoke all on public\.member_trial_profiles from anon, authenticated/i)
    expect(sql).toMatch(/revoke all on public\.member_absences from anon, authenticated/i)
    expect(sql).toMatch(/grant select, insert, update, delete on public\.member_trial_profiles to service_role/i)
    expect(sql).toMatch(/grant select, insert, update, delete on public\.member_absences to service_role/i)
    expect(sql).toMatch(/revoke all on function public\.create_member_absence/i)
    expect(sql).toMatch(/grant execute on function public\.create_member_absence[\s\S]*to service_role/i)
    expect(sql).toMatch(/revoke all on function public\.save_member_trial/i)
    expect(sql).toMatch(/grant execute on function public\.save_member_trial[\s\S]*to service_role/i)
  })
})
