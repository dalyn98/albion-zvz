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
})
