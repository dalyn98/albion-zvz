import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('event state snapshot (mig 274)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('event-state-snapshot')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('changes after a live slot assignment and rejects a different tenant scope', async () => {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const partyId = crypto.randomUUID()
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Snapshot event',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
    })
    expect(eventError).toBeNull()
    const { error: partyError } = await client.from('parties').insert({
      id: partyId,
      guild_id: tenant.guildId,
      event_id: eventId,
      party_number: 1,
    })
    expect(partyError).toBeNull()

    const slotId = crypto.randomUUID()
    const readRevision = async (): Promise<number> => {
      const { data, error } = await client
        .from('events')
        .select('state_revision')
        .eq('guild_id', tenant.guildId)
        .eq('id', eventId)
        .single()
      expect(error).toBeNull()
      return Number(data?.state_revision)
    }
    const revisionBeforeSlot = await readRevision()
    const { error: slotError } = await client.from('slots').insert({
      id: slotId,
      guild_id: tenant.guildId,
      party_id: partyId,
      slot_number: 1,
      role_name: 'Healer',
    })
    expect(slotError).toBeNull()
    const revisionAfterSlot = await readRevision()
    expect(revisionAfterSlot).toBe(revisionBeforeSlot + 1)

    const { data: before, error: beforeError } = await client.rpc(
      'get_event_state_snapshot',
      { p_guild_id: tenant.guildId, p_event_id: eventId },
    )
    expect(beforeError).toBeNull()

    const { error: assignmentError } = await client
      .from('slots')
      .update({
        assigned_discord_id: '1234567890',
        assigned_username: 'Snapshot Member',
      })
      .eq('guild_id', tenant.guildId)
      .eq('id', slotId)
    expect(assignmentError).toBeNull()
    expect(await readRevision()).toBe(revisionAfterSlot + 1)

    const { data: after, error: afterError } = await client.rpc(
      'get_event_state_snapshot',
      { p_guild_id: tenant.guildId, p_event_id: eventId },
    )
    expect(afterError).toBeNull()
    expect((after as { fingerprint: string }).fingerprint).not.toBe(
      (before as { fingerprint: string }).fingerprint,
    )

    const otherTenant = await createTestTenant('event-state-other')
    try {
      const { data: crossTenant, error: crossTenantError } = await client.rpc(
        'get_event_state_snapshot',
        { p_guild_id: otherTenant.guildId, p_event_id: eventId },
      )
      expect(crossTenantError).toBeNull()
      expect(crossTenant).toBeNull()
    } finally {
      await otherTenant.cleanup()
    }
  })

  it('changes after build-catalog and non-combat regear eligibility mutations', async () => {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const slotsEventId = crypto.randomUUID()
    const discordId = `snapshot-${crypto.randomUUID()}`
    const { error: eventError } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Snapshot dependencies',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '갱킹',
      recruitment_mode: 'hybrid',
    })
    expect(eventError).toBeNull()
    const { error: slotsEventError } = await client.from('events').insert({
      id: slotsEventId,
      guild_id: tenant.guildId,
      title: 'Slot snapshot control',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category: '전투',
      recruitment_mode: 'slots',
    })
    expect(slotsEventError).toBeNull()

    const readFingerprint = async (snapshotEventId = eventId): Promise<string> => {
      const { data, error } = await client.rpc('get_event_state_snapshot', {
        p_guild_id: tenant.guildId,
        p_event_id: snapshotEventId,
      })
      expect(error).toBeNull()
      return (data as { fingerprint: string }).fingerprint
    }

    const before = await readFingerprint()
    const slotsBefore = await readFingerprint(slotsEventId)
    const { error: templateError } = await client.from('slot_templates').insert({
      guild_id: tenant.guildId,
      name: 'Snapshot build',
      category: '전투',
      data: {
        role_name: 'Healer',
        weapon_id: 'T4_MAIN_HOLYSTAFF',
        weapon_name: 'Holy Staff',
      },
    })
    expect(templateError).toBeNull()
    const afterTemplate = await readFingerprint()
    expect(afterTemplate).not.toBe(before)
    expect(await readFingerprint(slotsEventId)).toBe(slotsBefore)

    const { error: participantError } = await client.from('event_regear_participants').insert({
      guild_id: tenant.guildId,
      event_id: eventId,
      discord_id: discordId,
      username: 'Snapshot Member',
      role_name: 'Healer',
    })
    expect(participantError).toBeNull()
    expect(await readFingerprint()).not.toBe(afterTemplate)
  })
})
