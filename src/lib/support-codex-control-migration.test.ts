import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/421_support_codex_control.sql'),
  'utf8',
)

describe('support Codex control migration', () => {
  it('hard-locks requests and approvals to the configured owner', () => {
    expect(sql.match(/490294888605155339/g)?.length).toBeGreaterThanOrEqual(5)
    expect(sql).toMatch(/requested_by_discord_id text not null[\s\S]*check \(requested_by_discord_id = '490294888605155339'\)/i)
    expect(sql).toMatch(/approved_by_discord_id text[\s\S]*approved_by_discord_id = '490294888605155339'/i)
  })

  it('keeps the queue and audit events service-role only', () => {
    for (const table of ['support_codex_jobs', 'support_codex_job_events', 'support_codex_workers']) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'))
    }
    expect(sql).toMatch(/grant execute on function public\.claim_support_codex_job\(text\)[\s\S]*to service_role/i)
  })

  it('serializes per-ticket work and uses lease-safe claims', () => {
    expect(sql).toMatch(/support_codex_jobs_one_active_per_ticket[\s\S]*pending_approval[\s\S]*queued[\s\S]*running/i)
    expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('support-codex:'")
    expect(sql).toMatch(/for update skip locked/i)
    expect(sql).toMatch(/lease_token = gen_random_uuid\(\)/i)
    expect(sql).toMatch(/attempts >= 3/i)
    expect(sql).toMatch(/support_codex_workers[\s\S]*last_seen_at/i)
    expect(sql).toContain("'job.claimed'")
  })

  it('requires an explicit approval and supports cancellation heartbeats', () => {
    expect(sql).toContain('pending_approval')
    expect(sql).toContain('approve_support_codex_job')
    expect(sql).toMatch(/approval_expires_at < now\(\)/i)
    expect(sql).toMatch(/heartbeat_support_codex_job[\s\S]*cancel_requested_at is not null/i)
  })
})
