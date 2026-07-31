import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('event recruitment mode assignment', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('event-recruitment-modes')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  async function createSlot(
    partyNumber: number,
    isBombSquad: boolean,
  ): Promise<string> {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const partyId = crypto.randomUUID()
    const slotId = crypto.randomUUID()
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: isBombSquad ? 'Approval recruitment' : 'Direct recruitment',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
      recruitment_mode: 'slots',
    })
    expect(eventError).toBeNull()

    const { error: partyError } = await client.from('parties').insert({
      id: partyId,
      guild_id: tenant.guildId,
      event_id: eventId,
      party_number: partyNumber,
      is_bomb_squad: isBombSquad,
      bomb_squad_kind: isBombSquad ? 'melee' : null,
    })
    expect(partyError).toBeNull()

    const { error: slotError } = await client.from('slots').insert({
      id: slotId,
      guild_id: tenant.guildId,
      party_id: partyId,
      slot_number: 1,
      role_name: 'EngageDps',
    })
    expect(slotError).toBeNull()
    return slotId
  }

  it('assigns a regular slot immediately without creating an approval request', async () => {
    const client = getTestServiceClient()
    const slotId = await createSlot(1, false)
    const { error } = await client.rpc('assign_slot', {
      p_slot_id: slotId,
      p_discord_id: 'regular-member',
      p_username: 'Regular Member',
      p_picks: null,
    })
    expect(error).toBeNull()

    const { data: slot, error: readError } = await client
      .from('slots')
      .select('assigned_discord_id, requested_discord_id')
      .eq('guild_id', tenant.guildId)
      .eq('id', slotId)
      .single()
    expect(readError).toBeNull()
    expect(slot).toEqual({
      assigned_discord_id: 'regular-member',
      requested_discord_id: null,
    })
  })

  it('keeps a bomb-squad request pending until an operator approves it', async () => {
    const client = getTestServiceClient()
    const slotId = await createSlot(2, true)
    const { error: requestError } = await client.rpc('assign_slot', {
      p_slot_id: slotId,
      p_discord_id: 'approval-member',
      p_username: 'Approval Member',
      p_picks: null,
    })
    expect(requestError).toBeNull()

    const { data: pending, error: pendingError } = await client
      .from('slots')
      .select('assigned_discord_id, requested_discord_id')
      .eq('guild_id', tenant.guildId)
      .eq('id', slotId)
      .single()
    expect(pendingError).toBeNull()
    expect(pending).toEqual({
      assigned_discord_id: null,
      requested_discord_id: 'approval-member',
    })

    const { error: approveError } = await client.rpc('approve_slot_request', {
      p_slot_id: slotId,
    })
    expect(approveError).toBeNull()

    const { data: assigned, error: assignedError } = await client
      .from('slots')
      .select('assigned_discord_id, requested_discord_id')
      .eq('guild_id', tenant.guildId)
      .eq('id', slotId)
      .single()
    expect(assignedError).toBeNull()
    expect(assigned).toEqual({
      assigned_discord_id: 'approval-member',
      requested_discord_id: null,
    })
  })
})
