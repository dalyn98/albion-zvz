import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTestServiceClient, hasTestEnv } from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('owner-only support Codex queue invariants', () => {
  let client: ReturnType<typeof getTestServiceClient>
  const supportGuildId = '893456789012345678'
  const operatorId = '490294888605155339'
  const controlChannelId = '893456789012345679'
  let ticketId = ''

  beforeEach(async () => {
    client = getTestServiceClient()
    const settings = await client.from('support_ticket_settings').insert({
      support_guild_id: supportGuildId,
      parent_channel_id: '893456789012345680',
      log_channel_id: '893456789012345681',
      codex_channel_id: controlChannelId,
      staff_role_ids: ['893456789012345682'],
      enabled: true,
      updated_by_discord_id: operatorId,
    })
    expect(settings.error).toBeNull()
    const ticket = await client.rpc('reserve_support_ticket', {
      p_support_guild_id: supportGuildId,
      p_opener_discord_id: '893456789012345683',
      p_opener_name: 'Requester',
      p_opener_locale: 'ko',
      p_related_tenant_id: null,
      p_related_guild_hint: 'Guild',
      p_category: 'bug',
      p_subject: 'Event save fails',
      p_description: 'Saving an event returns an error.',
      p_interaction_id: '893456789012345684',
    }).single()
    expect(ticket.error).toBeNull()
    ticketId = (ticket.data as { id: string }).id
    const finalized = await client.rpc('finalize_support_ticket', {
      p_ticket_id: ticketId,
      p_thread_id: '893456789012345685',
      p_header_message_id: '893456789012345686',
    })
    expect(finalized.error).toBeNull()
  })

  afterEach(async () => {
    await client.from('support_tickets').delete().eq('support_guild_id', supportGuildId)
    await client.from('support_ticket_settings').delete().eq('support_guild_id', supportGuildId)
  })

  it('rejects every non-owner before creating work', async () => {
    const denied = await client.rpc('create_support_codex_job', {
      p_support_guild_id: supportGuildId,
      p_ticket_id: ticketId,
      p_mode: 'analyze',
      p_instruction: 'Inspect the failure.',
      p_actor_discord_id: '490294888605155338',
      p_interaction_id: '893456789012345687',
      p_control_channel_id: controlChannelId,
      p_base_git_sha: null,
      p_parent_job_id: null,
    })
    expect(denied.error?.message).toContain('invalid_support_codex_job_input')
    const rows = await client.from('support_codex_jobs').select('id').eq('ticket_id', ticketId)
    expect(rows.data).toEqual([])
  })

  it('requires approval, claims idempotently, heartbeats, and completes idempotently', async () => {
    const created = await client.rpc('create_support_codex_job', {
      p_support_guild_id: supportGuildId,
      p_ticket_id: ticketId,
      p_mode: 'analyze',
      p_instruction: 'Inspect the failure.',
      p_actor_discord_id: operatorId,
      p_interaction_id: '893456789012345688',
      p_control_channel_id: controlChannelId,
      p_base_git_sha: 'a'.repeat(40),
      p_parent_job_id: null,
    }).single()
    expect(created.error).toBeNull()
    const jobId = (created.data as { id: string }).id
    expect((created.data as { status: string }).status).toBe('pending_approval')

    const beforeApproval = await client.rpc('claim_support_codex_job', { p_worker_id: 'worker:test' })
    expect(beforeApproval.data).toEqual([])

    const approved = await client.rpc('approve_support_codex_job', {
      p_job_id: jobId,
      p_actor_discord_id: operatorId,
      p_interaction_id: '893456789012345689',
    }).single()
    expect(approved.error).toBeNull()
    expect((approved.data as { status: string }).status).toBe('queued')

    const firstClaim = await client.rpc('claim_support_codex_job', { p_worker_id: 'worker:test' })
    expect(firstClaim.error).toBeNull()
    const first = (firstClaim.data as Array<{
      id: string
      lease_token: string
      attempts: number
    }>)[0]
    expect(first).toMatchObject({ id: jobId, attempts: 1 })

    const repeatedClaim = await client.rpc('claim_support_codex_job', { p_worker_id: 'worker:test' })
    const repeated = (repeatedClaim.data as Array<{ id: string; lease_token: string; attempts: number }>)[0]
    expect(repeated).toMatchObject({ id: jobId, lease_token: first.lease_token, attempts: 1 })
    const worker = await client.from('support_codex_workers')
      .select('current_job_id, last_seen_at').eq('worker_id', 'worker:test').single()
    expect(worker.error).toBeNull()
    expect(worker.data?.current_job_id).toBe(jobId)

    const heartbeat = await client.rpc('heartbeat_support_codex_job', {
      p_job_id: jobId,
      p_lease_token: first.lease_token,
      p_worker_id: 'worker:test',
    })
    expect(heartbeat.error).toBeNull()
    expect(heartbeat.data).toBe(false)

    const completionInput = {
      p_job_id: jobId,
      p_lease_token: first.lease_token,
      p_worker_id: 'worker:test',
      p_codex_thread_id: 'thread-test',
      p_base_git_sha: 'a'.repeat(40),
      p_result: {
        outcome: 'completed',
        summary: 'Root cause found.',
        diagnosis: 'A stale state check rejects the save.',
        filesChanged: [],
        tests: ['npm test'],
        risks: [],
        nextActions: ['Implement the guard fix.'],
      },
    }
    const completed = await client.rpc('complete_support_codex_job', completionInput).single()
    expect(completed.error).toBeNull()
    expect((completed.data as { status: string }).status).toBe('completed')
    const idleWorker = await client.from('support_codex_workers')
      .select('current_job_id').eq('worker_id', 'worker:test').single()
    expect(idleWorker.data?.current_job_id).toBeNull()

    const repeatedCompletion = await client.rpc('complete_support_codex_job', completionInput).single()
    expect(repeatedCompletion.error).toBeNull()
    expect((repeatedCompletion.data as { status: string }).status).toBe('completed')
  })

  it('turns a running cancellation into a worker-visible stop signal', async () => {
    const created = await client.rpc('create_support_codex_job', {
      p_support_guild_id: supportGuildId,
      p_ticket_id: ticketId,
      p_mode: 'implement',
      p_instruction: 'Fix and test the failure.',
      p_actor_discord_id: operatorId,
      p_interaction_id: '893456789012345690',
      p_control_channel_id: controlChannelId,
      p_base_git_sha: null,
      p_parent_job_id: null,
    }).single()
    const jobId = (created.data as { id: string }).id
    await client.rpc('approve_support_codex_job', {
      p_job_id: jobId,
      p_actor_discord_id: operatorId,
      p_interaction_id: '893456789012345691',
    })
    const claim = await client.rpc('claim_support_codex_job', { p_worker_id: 'worker:cancel' })
    const lease = (claim.data as Array<{ lease_token: string }>)[0].lease_token
    const cancelled = await client.rpc('cancel_support_codex_job', {
      p_job_id: jobId,
      p_actor_discord_id: operatorId,
      p_interaction_id: '893456789012345692',
    }).single()
    expect((cancelled.data as { status: string; cancel_requested_at: string }).status).toBe('running')
    expect((cancelled.data as { cancel_requested_at: string }).cancel_requested_at).toBeTruthy()
    const heartbeat = await client.rpc('heartbeat_support_codex_job', {
      p_job_id: jobId,
      p_lease_token: lease,
      p_worker_id: 'worker:cancel',
    })
    expect(heartbeat.data).toBe(true)
  })
})
