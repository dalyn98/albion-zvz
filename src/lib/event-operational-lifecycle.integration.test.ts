import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('event operational lifecycle (migrations 329-330)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('event-operational-lifecycle')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('publishes once, freezes a started snapshot, and permits internal progress markers', async () => {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const partyId = crypto.randomUUID()
    const gatherAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Operational lifecycle',
      gather_time: '',
      gather_at: gatherAt,
      gather_location: 'Bridgewatch',
      status: 'draft',
      category: '전투',
    })
    expect(eventError).toBeNull()
    const { data: draft } = await client
      .from('events')
      .select('published_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', eventId)
      .single()
    expect(draft?.published_at).toBeNull()

    const { error: publishError } = await client
      .from('events')
      .update({ status: 'published' })
      .eq('guild_id', tenant.guildId)
      .eq('id', eventId)
    expect(publishError).toBeNull()
    const { error: partyError } = await client.from('parties').insert({
      id: partyId,
      guild_id: tenant.guildId,
      event_id: eventId,
      party_number: 1,
    })
    expect(partyError).toBeNull()

    const startedAt = new Date().toISOString()
    const { error: startError } = await client
      .from('events')
      .update({ battle_started_at: startedAt })
      .eq('guild_id', tenant.guildId)
      .eq('id', eventId)
    expect(startError).toBeNull()
    const { data: started } = await client
      .from('events')
      .select('published_at, battle_started_at, operational_ended_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', eventId)
      .single()
    expect(started?.published_at).toEqual(expect.any(String))
    expect(Date.parse(started?.operational_ended_at ?? '')).toBe(
      Date.parse(startedAt) + 60 * 60 * 1000,
    )

    const [{ error: editError }, { error: resetError }, { error: deleteError }] =
      await Promise.all([
        client
          .from('events')
          .update({ title: 'Mutated' })
          .eq('guild_id', tenant.guildId)
          .eq('id', eventId),
        client
          .from('events')
          .update({ battle_started_at: null })
          .eq('guild_id', tenant.guildId)
          .eq('id', eventId),
        client
          .from('events')
          .delete()
          .eq('guild_id', tenant.guildId)
          .eq('id', eventId),
      ])
    expect(editError?.message).toContain('event_operational_snapshot_locked')
    expect(resetError?.message).toMatch(/event_operational_(start|snapshot)_locked/)
    expect(deleteError?.message).toContain('event_operational_snapshot_locked')

    const { error: childError } = await client.from('parties').insert({
      guild_id: tenant.guildId,
      event_id: eventId,
      party_number: 2,
    })
    expect(childError?.message).toContain('event_operational_composition_locked')

    const { error: progressError } = await client
      .from('events')
      .update({ auto_regear_processed_at: new Date().toISOString() })
      .eq('guild_id', tenant.guildId)
      .eq('id', eventId)
    expect(progressError).toBeNull()
  })

  it('enforces mandatory auto-start and retires subjective AAR writes', async () => {
    const client = getTestServiceClient()
    const { error: falseError } = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'events_auto_start_enabled',
      value: 'false',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id,key' })
    expect(falseError?.message).toContain('event_auto_start_is_mandatory')

    const { error: trueError } = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'events_auto_start_enabled',
      value: 'true',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id,key' })
    expect(trueError).toBeNull()

    const eventId = crypto.randomUUID()
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'AAR retired',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
    })
    expect(eventError).toBeNull()
    const { error: aarError } = await client
      .from('event_after_action_reviews')
      .insert({
        guild_id: tenant.guildId,
        event_id: eventId,
        summary: 'Subjective review',
        updated_by: 'admin',
      })
    expect(aarError).not.toBeNull()
  })
})
