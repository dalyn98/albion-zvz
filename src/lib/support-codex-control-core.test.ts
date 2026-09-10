import { describe, expect, it } from 'vitest'
import {
  buildSupportCodexJobPayload,
  buildSupportCodexPanelPayload,
  buildSupportCodexTicketPicker,
  isSupportCodexOperator,
  normalizeSupportCodexInstruction,
  parseSupportCodexCustomId,
  parseSupportCodexTicketSelection,
  SUPPORT_CODEX_OPERATOR_DISCORD_ID,
  supportCodexFollowupCustomId,
  supportCodexJobCustomId,
  supportCodexModalCustomId,
} from './support-codex-control-core'

const jobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ticketId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('support Codex control core', () => {
  it('allows exactly the configured owner', () => {
    expect(SUPPORT_CODEX_OPERATOR_DISCORD_ID).toBe('490294888605155339')
    expect(isSupportCodexOperator('490294888605155339')).toBe(true)
    expect(isSupportCodexOperator('490294888605155338')).toBe(false)
    expect(isSupportCodexOperator(null)).toBe(false)
  })

  it('parses only versioned and bounded component ids', () => {
    expect(parseSupportCodexCustomId(supportCodexModalCustomId('analyze', ticketId))).toEqual({
      kind: 'modal', mode: 'analyze', ticketId,
    })
    expect(parseSupportCodexCustomId(supportCodexFollowupCustomId(jobId))).toEqual({
      kind: 'followup', jobId,
    })
    expect(parseSupportCodexCustomId(supportCodexJobCustomId('approve', jobId))).toEqual({
      kind: 'job', action: 'approve', jobId,
    })
    expect(parseSupportCodexCustomId('support-codex:v1:job:approve:not-a-uuid')).toBeNull()
    expect(parseSupportCodexCustomId('support-codex:v2:panel:analyze')).toBeNull()
  })

  it('normalizes control characters and validates selections', () => {
    expect(normalizeSupportCodexInstruction('  inspect\u0000 this\r\n\r\n\r\n\r\nnow  '))
      .toBe('inspect this\n\n\nnow')
    expect(normalizeSupportCodexInstruction('   ')).toBeNull()
    expect(parseSupportCodexTicketSelection([ticketId])).toBe(ticketId)
    expect(parseSupportCodexTicketSelection(['not-a-ticket'])).toBeNull()
  })

  it('builds an owner-only button panel and caps ticket choices', () => {
    const panel = buildSupportCodexPanelPayload()
    expect(panel.embeds?.[0]?.footer?.text).toContain(SUPPORT_CODEX_OPERATOR_DISCORD_ID)
    expect(panel.components?.[0]?.components).toHaveLength(3)
    const tickets = Array.from({ length: 30 }, (_, index) => ({
      id: `${String(index).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      ticketNumber: index + 1,
      subject: `Ticket ${index}`,
      category: 'bug',
      status: 'open',
    }))
    const picker = buildSupportCodexTicketPicker('analyze', tickets)
    const select = picker[0].components[0]
    expect(select.type).toBe(3)
    if (select.type === 3) expect(select.options).toHaveLength(25)
  })

  it('never exposes leases or worker identity in Discord result cards', () => {
    const payload = buildSupportCodexJobPayload({
      ticketNumber: 7,
      ticketSubject: 'Login loop',
      job: {
        id: jobId,
        ticket_id: ticketId,
        parent_job_id: null,
        support_guild_id: '823456789012345678',
        mode: 'analyze',
        instruction: 'Investigate the login loop.',
        status: 'completed',
        requested_by_discord_id: SUPPORT_CODEX_OPERATOR_DISCORD_ID,
        approved_by_discord_id: SUPPORT_CODEX_OPERATOR_DISCORD_ID,
        request_interaction_id: '123456789012345678',
        approval_interaction_id: '123456789012345679',
        control_channel_id: '923456789012345678',
        status_message_id: null,
        base_git_sha: 'a'.repeat(40),
        workspace_key: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        codex_thread_id: 'thread-secret',
        result: {
          summary: 'Found the cause.',
          diagnosis: 'Callback state mismatch.',
          filesChanged: [],
          tests: ['npm test'],
          risks: [],
        },
        error_code: null,
        attempts: 1,
        available_at: '2026-09-10T00:00:00Z',
        approval_expires_at: '2026-09-10T00:30:00Z',
        approved_at: '2026-09-10T00:00:01Z',
        started_at: '2026-09-10T00:00:02Z',
        completed_at: '2026-09-10T00:00:03Z',
        cancel_requested_at: null,
        lease_token: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        lease_owner: 'private-worker',
        lease_expires_at: null,
        created_at: '2026-09-10T00:00:00Z',
        updated_at: '2026-09-10T00:00:03Z',
      },
    })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('dddddddd-dddd-4ddd-8ddd-dddddddddddd')
    expect(serialized).not.toContain('private-worker')
    expect(serialized).not.toContain('thread-secret')
    expect(serialized).toContain('Found the cause.')
  })
})
