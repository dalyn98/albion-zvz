import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function allMigrationSql(): string {
  return readdirSync(migrationsDir)
    .sort()
    .filter((fileName) => fileName.endsWith('.sql'))
    .map((fileName) => readFileSync(join(migrationsDir, fileName), 'utf8'))
    .join('\n')
}

describe('regear video proof migration', () => {
  it('adds a nullable video proof URL to existing regear requests', () => {
    const sql = allMigrationSql()

    expect(sql).toContain('add column if not exists video_proof_url text')
    expect(sql).toContain('comment on column public.regear_requests.video_proof_url')
  })

  it('adds a nullable cached video proof title to existing regear requests', () => {
    const sql = allMigrationSql()

    expect(sql).toContain('add column if not exists video_proof_title text')
    expect(sql).toContain('comment on column public.regear_requests.video_proof_title')
    expect(sql).toContain('char_length(video_proof_title) <= 300')
  })

  it('seeds the per-tenant video proof payout rate setting', () => {
    const sql = allMigrationSql()

    expect(sql).toContain("'regear_video_payout_rate_percent'")
    expect(sql).toContain('on conflict (guild_id, key) do nothing')
  })

  it('keeps the base claim ceiling when video proof can raise the effective ceiling', () => {
    const sql = allMigrationSql()

    expect(sql).toContain('add column if not exists base_silver integer')
  })

  it('seeds the per-tenant video proof fixed claim ceiling bonus setting', () => {
    const sql = allMigrationSql()

    expect(sql).toContain("'regear_video_claim_ceiling_bonus_silver'")
    expect(sql).toContain("select id, 'regear_video_claim_ceiling_bonus_silver', '0', now()")
  })

  it('adds an event flag for applying the video rate without proof', () => {
    const sql = allMigrationSql()

    expect(sql).toContain(
      'add column if not exists regear_video_rate_applies_without_proof boolean not null default false',
    )
    expect(sql).toContain('events_regear_video_rate_without_proof_policy_chk')
  })
})
