import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/351_admin_work_queue_snapshot.sql'),
  'utf8',
)

describe('migration 351 admin work queue snapshot', () => {
  it('provides one feature-aware snapshot for every current operator queue', () => {
    for (const key of [
      'regear',
      'exchange',
      'donation',
      'shop',
      'memberTrade',
      'eventPayout',
      'craft',
    ]) {
      expect(sql).toContain(`'${key}'::text`)
    }
    expect(sql).toContain("feature.state in ('enabled', 'draining')")
    expect(sql).not.toContain('battle')
  })

  it('is read-only and service-role only', () => {
    expect(sql).toMatch(/language sql[\s\S]*stable[\s\S]*security definer/i)
    expect(sql).toMatch(
      /revoke all on function public\.admin_work_queue_snapshot\(uuid\)[\s\S]*from public, anon, authenticated/i,
    )
    expect(sql).toMatch(
      /grant execute on function public\.admin_work_queue_snapshot\(uuid\)[\s\S]*to service_role/i,
    )
    expect(sql).not.toMatch(/\b(insert|update|delete)\s+(into|public\.)/i)
  })
})
