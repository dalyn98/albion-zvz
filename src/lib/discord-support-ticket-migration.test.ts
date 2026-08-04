import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/365_support_ticket_threads.sql'),
  'utf8',
)
const operationsSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/369_support_ticket_operations.sql'),
  'utf8',
)
const intakeRateSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/370_support_ticket_intake_rate.sql'),
  'utf8',
)
const resourcesSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/371_support_server_resources.sql'),
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

  it('keeps AI advisory and operational tables service-role only', () => {
    for (const table of [
      'support_ticket_jobs',
      'support_ticket_ai_analyses',
      'support_known_issues',
      'support_ticket_known_issue_links',
      'support_ticket_feedback',
      'support_ticket_sla_events',
    ]) {
      expect(operationsSql).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
      )
      expect(operationsSql).toMatch(
        new RegExp(`revoke all on public\\.${table} from public, anon, authenticated`, 'i'),
      )
    }
  })

  it('queues AI only after provisioning and isolates retryable processing', () => {
    expect(operationsSql).toMatch(/new\.event_type <> 'ticket\.provisioned'/i)
    expect(operationsSql).toMatch(/for update skip locked/i)
    expect(operationsSql).toMatch(/attempts >= 5 then 'failed'/i)
    expect(operationsSql).toMatch(/AI analysis[\s\S]*never authorizes or performs a ticket action/i)
  })

  it('records human confirmation for priorities, known issues, and feedback', () => {
    expect(operationsSql).toContain('set_support_ticket_priority')
    expect(operationsSql).toContain('link_support_ticket_known_issue')
    expect(operationsSql).toMatch(/ticket\.close_requester[\s\S]*support_ticket_feedback/i)
  })

  it('enforces a database-backed requester intake burst limit', () => {
    expect(intakeRateSql).toMatch(/created_at > now\(\) - interval '1 hour'/i)
    expect(intakeRateSql).toMatch(/count\(\*\)[\s\S]*>= 3/i)
    expect(intakeRateSql).toContain('support_ticket_rate_limited')
  })

  it('stores only versioned operational resource pointers in service-only settings', () => {
    expect(resourcesSql).toMatch(/resource_channel_ids jsonb not null default '\{\}'::jsonb/i)
    expect(resourcesSql).toMatch(/resource_message_ids jsonb not null default '\{\}'::jsonb/i)
    expect(resourcesSql).toMatch(/jsonb_typeof\(resource_channel_ids\) = 'object'/i)
    expect(resourcesSql).toMatch(/jsonb_typeof\(resource_message_ids\) = 'object'/i)
    expect(resourcesSql).toMatch(/resources_version is null or char_length\(resources_version\) between 1 and 80/i)
  })
})
