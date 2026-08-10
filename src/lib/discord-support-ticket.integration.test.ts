import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTestServiceClient, hasTestEnv } from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('support ticket database invariants', () => {
  const client = getTestServiceClient()
  const supportGuildId = '823456789012345678'
  const openerId = '723456789012345678'

  beforeEach(async () => {
    const { error } = await client.from('support_ticket_settings').insert({
      support_guild_id: supportGuildId,
      parent_channel_id: '623456789012345678',
      log_channel_id: '523456789012345678',
      staff_role_ids: ['423456789012345678'],
      enabled: true,
      updated_by_discord_id: '323456789012345678',
    })
    expect(error).toBeNull()
  })

  afterEach(async () => {
    await client.from('support_tickets').delete().eq('support_guild_id', supportGuildId)
    await client.from('support_ticket_settings').delete().eq('support_guild_id', supportGuildId)
  })

  it('returns the existing active ticket for concurrent-looking duplicate intake', async () => {
    const first = await client.rpc('reserve_support_ticket', {
      p_support_guild_id: supportGuildId,
      p_opener_discord_id: openerId,
      p_opener_name: 'Requester',
      p_opener_locale: 'ko',
      p_related_tenant_id: null,
      p_related_guild_hint: null,
      p_category: 'bug',
      p_subject: 'First',
      p_description: 'First details',
      p_interaction_id: '223456789012345678',
    }).single()
    expect(first.error).toBeNull()

    const second = await client.rpc('reserve_support_ticket', {
      p_support_guild_id: supportGuildId,
      p_opener_discord_id: openerId,
      p_opener_name: 'Requester',
      p_opener_locale: 'ko',
      p_related_tenant_id: null,
      p_related_guild_hint: null,
      p_category: 'other',
      p_subject: 'Second',
      p_description: 'Second details',
      p_interaction_id: '123456789012345679',
    }).single()
    expect(second.error).toBeNull()
    expect((second.data as { id?: string } | null)?.id).toBe(
      (first.data as { id?: string } | null)?.id,
    )
  })

  it('accepts a newly added Albion locale at the ticket RPC boundary', async () => {
    const reserved = await client.rpc('reserve_support_ticket', {
      p_support_guild_id: supportGuildId,
      p_opener_discord_id: openerId,
      p_opener_name: 'Requester',
      p_opener_locale: 'zh-Hant',
      p_related_tenant_id: null,
      p_related_guild_hint: null,
      p_category: 'other',
      p_subject: 'Locale support',
      p_description: 'Traditional Chinese locale',
      p_interaction_id: '123456789012345677',
    }).single()
    expect(reserved.error).toBeNull()
    expect((reserved.data as { opener_locale?: string } | null)?.opener_locale).toBe('zh-Hant')
  })

  it('enforces requester ownership and idempotent workflow interactions', async () => {
    const reserved = await client.rpc('reserve_support_ticket', {
      p_support_guild_id: supportGuildId,
      p_opener_discord_id: openerId,
      p_opener_name: 'Requester',
      p_opener_locale: 'en',
      p_related_tenant_id: null,
      p_related_guild_hint: null,
      p_category: 'account',
      p_subject: 'Login',
      p_description: 'Cannot login',
      p_interaction_id: '123456789012345680',
    }).single()
    expect(reserved.error).toBeNull()
    const ticketId = (reserved.data as { id?: string } | null)?.id as string
    const finalized = await client.rpc('finalize_support_ticket', {
      p_ticket_id: ticketId,
      p_thread_id: '923456789012345678',
      p_header_message_id: '923456789012345679',
    }).single()
    expect(finalized.error).toBeNull()

    const denied = await client.rpc('transition_support_ticket', {
      p_ticket_id: ticketId,
      p_action: 'continue',
      p_actor_discord_id: '123456789012345699',
      p_actor_kind: 'requester',
      p_interaction_id: '123456789012345681',
    })
    expect(denied.error?.message).toContain('support_ticket_requester_only')

    const assigned = await client.rpc('transition_support_ticket', {
      p_ticket_id: ticketId,
      p_action: 'assign',
      p_actor_discord_id: '423456789012345678',
      p_actor_kind: 'staff',
      p_interaction_id: '123456789012345682',
    }).single()
    expect(assigned.error).toBeNull()
    expect((assigned.data as { status?: string } | null)?.status).toBe('in_progress')
    const repeated = await client.rpc('transition_support_ticket', {
      p_ticket_id: ticketId,
      p_action: 'assign',
      p_actor_discord_id: '423456789012345678',
      p_actor_kind: 'staff',
      p_interaction_id: '123456789012345682',
    }).single()
    expect(repeated.error).toBeNull()
    expect((repeated.data as { status?: string } | null)?.status).toBe('in_progress')
  })

  it('keeps AI advisory jobs and human operational decisions separate', async () => {
    const reserved = await client.rpc('reserve_support_ticket', {
      p_support_guild_id: supportGuildId,
      p_opener_discord_id: openerId,
      p_opener_name: 'Requester',
      p_opener_locale: 'en',
      p_related_tenant_id: null,
      p_related_guild_hint: null,
      p_category: 'bug',
      p_subject: 'Login loop',
      p_description: 'OAuth keeps redirecting back to login.',
      p_interaction_id: '123456789012345690',
    }).single()
    expect(reserved.error).toBeNull()
    const ticketId = (reserved.data as { id?: string } | null)?.id as string
    const finalized = await client.rpc('finalize_support_ticket', {
      p_ticket_id: ticketId,
      p_thread_id: '923456789012345690',
      p_header_message_id: '923456789012345691',
    }).single()
    expect(finalized.error).toBeNull()

    const queued = await client.from('support_ticket_jobs').select('id, status')
      .eq('ticket_id', ticketId).single()
    expect(queued.error).toBeNull()
    expect(queued.data?.status).toBe('pending')
    const claim = await client.rpc('claim_support_ticket_ai_jobs', {
      p_worker_id: 'integration-test',
      p_limit: 1,
    })
    expect(claim.error).toBeNull()
    const jobId = (claim.data as Array<{ id?: number }> | null)?.[0]?.id as number
    const completed = await client.rpc('complete_support_ticket_ai_job', {
      p_job_id: jobId,
      p_model_id: 'test/model',
      p_prompt_version: 'test-v1',
      p_category_suggestion: 'account',
      p_confidence: 0.8,
      p_staff_summary: 'Requester is caught in an OAuth login loop.',
      p_urgency_signal: 'normal',
      p_risk_flags: ['account_access'],
      p_pii_warning: false,
      p_known_issue_candidates: [],
      p_input_hash: 'a'.repeat(64),
      p_input_tokens: 100,
      p_output_tokens: 30,
    })
    expect(completed.error).toBeNull()
    const afterAi = await client.from('support_tickets').select('priority, ai_status')
      .eq('id', ticketId).single()
    expect(afterAi.data).toMatchObject({ priority: 'normal', ai_status: 'completed' })

    const prioritized = await client.rpc('set_support_ticket_priority', {
      p_ticket_id: ticketId,
      p_priority: 'high',
      p_actor_discord_id: '423456789012345678',
      p_interaction_id: '123456789012345692',
    }).single()
    expect(prioritized.error).toBeNull()
    expect((prioritized.data as { priority?: string } | null)?.priority).toBe('high')

    for (const [action, interactionId] of [
      ['assign', '123456789012345693'],
      ['resolve', '123456789012345694'],
      ['close_requester', '123456789012345695'],
    ] as const) {
      const transition = await client.rpc('transition_support_ticket', {
        p_ticket_id: ticketId,
        p_action: action,
        p_actor_discord_id: action === 'close_requester' ? openerId : '423456789012345678',
        p_actor_kind: action === 'close_requester' ? 'requester' : 'staff',
        p_interaction_id: interactionId,
      })
      expect(transition.error).toBeNull()
    }
    const feedback = await client.from('support_ticket_feedback').select('helpful')
      .eq('ticket_id', ticketId).single()
    expect(feedback.data?.helpful).toBe(true)
    const sla = await client.from('support_ticket_sla_events').select('event_type')
      .eq('ticket_id', ticketId)
    expect(new Set((sla.data ?? []).map((row) => row.event_type))).toEqual(
      new Set(['first_assignment', 'first_resolution']),
    )
  })

  it('rate-limits repeated ticket churn while preserving normal intake', async () => {
    for (let index = 0; index < 3; index += 1) {
      const suffix = String(710 + index)
      const reserved = await client.rpc('reserve_support_ticket', {
        p_support_guild_id: supportGuildId,
        p_opener_discord_id: openerId,
        p_opener_name: 'Requester',
        p_opener_locale: 'en',
        p_related_tenant_id: null,
        p_related_guild_hint: null,
        p_category: 'other',
        p_subject: `Question ${index}`,
        p_description: 'A legitimate short support request.',
        p_interaction_id: `123456789012345${suffix}`,
      }).single()
      expect(reserved.error).toBeNull()
      const ticketId = (reserved.data as { id?: string } | null)?.id as string
      const finalized = await client.rpc('finalize_support_ticket', {
        p_ticket_id: ticketId,
        p_thread_id: `923456789012345${suffix}`,
        p_header_message_id: `823456789012345${suffix}`,
      })
      expect(finalized.error).toBeNull()
      const closed = await client.rpc('transition_support_ticket', {
        p_ticket_id: ticketId,
        p_action: 'close_staff',
        p_actor_discord_id: '423456789012345678',
        p_actor_kind: 'staff',
        p_interaction_id: `723456789012345${suffix}`,
      })
      expect(closed.error).toBeNull()
    }
    const fourth = await client.rpc('reserve_support_ticket', {
      p_support_guild_id: supportGuildId,
      p_opener_discord_id: openerId,
      p_opener_name: 'Requester',
      p_opener_locale: 'en',
      p_related_tenant_id: null,
      p_related_guild_hint: null,
      p_category: 'other',
      p_subject: 'Fourth question',
      p_description: 'This request exceeds the burst limit.',
      p_interaction_id: '123456789012345799',
    })
    expect(fourth.error?.message).toContain('support_ticket_rate_limited')
  })
})
