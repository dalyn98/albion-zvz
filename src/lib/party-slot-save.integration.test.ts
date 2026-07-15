import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

interface PartySlotFixture {
  eventId: string
  partyId: string
  slotAId: string
  slotBId: string
  removedSlotId: string
}

async function createPartySlotFixture(tenant: TestTenant): Promise<PartySlotFixture> {
  const client = getTestServiceClient()
  const eventId = crypto.randomUUID()
  const partyId = crypto.randomUUID()
  const slotAId = crypto.randomUUID()
  const slotBId = crypto.randomUUID()
  const removedSlotId = crypto.randomUUID()

  const { error: eventError } = await client.from('events').insert({
    id: eventId,
    guild_id: tenant.guildId,
    title: 'Atomic party slot save',
    gather_time: '',
    gather_location: '',
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

  const { error: slotError } = await client.from('slots').insert([
    {
      id: slotAId,
      guild_id: tenant.guildId,
      party_id: partyId,
      slot_number: 1,
      role_name: 'EngageDps',
      assigned_discord_id: 'assigned-member',
      assigned_username: 'Assigned Member',
    },
    {
      id: slotBId,
      guild_id: tenant.guildId,
      party_id: partyId,
      slot_number: 2,
      role_name: 'Healer',
    },
    {
      id: removedSlotId,
      guild_id: tenant.guildId,
      party_id: partyId,
      slot_number: 3,
      role_name: 'Support',
    },
  ])
  expect(slotError).toBeNull()

  const { error: versionResetError } = await client
    .from('parties')
    .update({ slots_version: 0 })
    .eq('guild_id', tenant.guildId)
    .eq('id', partyId)
  expect(versionResetError).toBeNull()

  return { eventId, partyId, slotAId, slotBId, removedSlotId }
}

function regularPartyMeta(): Record<string, unknown> {
  return {
    name: null,
    is_bomb_squad: false,
    bomb_squad_kind: null,
    caller_discord_id: null,
  }
}

describeIntegration('atomic party slot layout save (mig 260)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('atomic-party-slots')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('commits reorder, deletion, addition, and gear edits while preserving kept assignments', async () => {
    const client = getTestServiceClient()
    const fixture = await createPartySlotFixture(tenant)
    const newSlotId = crypto.randomUUID()
    const slots = [
      {
        id: fixture.slotBId,
        slot_number: 1,
        is_hidden: false,
        role_name: 'Healer',
        notes: 'moved first',
        auto_regear_excluded: false,
        manual_regear_excluded: false,
        is_solo_bomb: false,
      },
      {
        id: newSlotId,
        slot_number: 2,
        is_hidden: false,
        role_name: 'BrawlerDps',
        notes: 'new slot',
        weapon_name: 'Battleaxe',
        weapon_id: 'T8_MAIN_AXE',
        gear_specs: { weapon: { tier: 8, enchant: 1 } },
        auto_regear_excluded: false,
        manual_regear_excluded: true,
        is_solo_bomb: false,
      },
      {
        id: fixture.slotAId,
        slot_number: 3,
        is_hidden: true,
        role_name: 'Tank',
        notes: 'assignment must survive',
        armor_name: 'Guardian Armor',
        armor_id: 'T8_ARMOR_PLATE_SET1',
        auto_regear_excluded: true,
        manual_regear_excluded: false,
        is_solo_bomb: false,
      },
    ]

    const args = {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_party_number: 1,
      p_party_id: fixture.partyId,
      p_expected_version: 0,
      p_party_meta: regularPartyMeta(),
      p_slots: slots,
    }
    const { data: saved, error } = await client.rpc('save_party_slots_atomic', args)

    expect(error).toBeNull()
    expect(saved).toMatchObject({
      party_id: fixture.partyId,
      slots_version: 1,
      slot_ids: [fixture.slotBId, newSlotId, fixture.slotAId],
    })

    const { data: storedSlots, error: readError } = await client
      .from('slots')
      .select('id, slot_number, role_name, notes, weapon_id, armor_id, assigned_discord_id, assigned_username')
      .eq('guild_id', tenant.guildId)
      .eq('party_id', fixture.partyId)
      .order('slot_number')
    expect(readError).toBeNull()
    expect(storedSlots).toEqual([
      expect.objectContaining({ id: fixture.slotBId, slot_number: 1, role_name: 'Healer' }),
      expect.objectContaining({ id: newSlotId, slot_number: 2, weapon_id: 'T8_MAIN_AXE' }),
      expect.objectContaining({
        id: fixture.slotAId,
        slot_number: 3,
        role_name: 'Tank',
        armor_id: 'T8_ARMOR_PLATE_SET1',
        assigned_discord_id: 'assigned-member',
        assigned_username: 'Assigned Member',
      }),
    ])
    expect(storedSlots?.some((slot) => slot.id === fixture.removedSlotId)).toBe(false)

    // Same payload + old expected version is a successful idempotent retry.
    const { data: retried, error: retryError } = await client.rpc('save_party_slots_atomic', args)
    expect(retryError).toBeNull()
    expect(retried).toMatchObject({ slots_version: 1 })
  })

  it('rejects a stale layout without partially deleting or renumbering slots', async () => {
    const client = getTestServiceClient()
    const fixture = await createPartySlotFixture(tenant)
    const currentLayout = [
      { id: fixture.slotAId, slot_number: 1, role_name: 'Tank', is_hidden: false },
      { id: fixture.slotBId, slot_number: 2, role_name: 'Healer', is_hidden: false },
      { id: fixture.removedSlotId, slot_number: 3, role_name: 'Support', is_hidden: false },
    ]

    const { error: firstError } = await client.rpc('save_party_slots_atomic', {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_party_number: 1,
      p_party_id: fixture.partyId,
      p_expected_version: 0,
      p_party_meta: regularPartyMeta(),
      p_slots: currentLayout,
    })
    expect(firstError).toBeNull()

    const { error: newerError } = await client.rpc('save_party_slots_atomic', {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_party_number: 1,
      p_party_id: fixture.partyId,
      p_expected_version: 1,
      p_party_meta: regularPartyMeta(),
      p_slots: currentLayout.map((slot, index) => (
        index === 0 ? { ...slot, role_name: 'EngageDps' } : slot
      )),
    })
    expect(newerError).toBeNull()

    const { error: staleError } = await client.rpc('save_party_slots_atomic', {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_party_number: 1,
      p_party_id: fixture.partyId,
      p_expected_version: 1,
      p_party_meta: regularPartyMeta(),
      p_slots: currentLayout.slice(1).map((slot, index) => ({
        ...slot,
        slot_number: index + 1,
      })),
    })
    expect(staleError?.message).toContain('PARTY_SLOTS_STALE')

    const [{ data: party }, { data: slots }] = await Promise.all([
      client
        .from('parties')
        .select('slots_version')
        .eq('guild_id', tenant.guildId)
        .eq('id', fixture.partyId)
        .single(),
      client
        .from('slots')
        .select('id, slot_number, role_name')
        .eq('guild_id', tenant.guildId)
        .eq('party_id', fixture.partyId)
        .order('slot_number'),
    ])
    expect(party?.slots_version).toBe(2)
    expect(slots).toEqual([
      expect.objectContaining({ id: fixture.slotAId, slot_number: 1, role_name: 'EngageDps' }),
      expect.objectContaining({ id: fixture.slotBId, slot_number: 2 }),
      expect.objectContaining({ id: fixture.removedSlotId, slot_number: 3 }),
    ])
  })

  it('rolls back the whole save when a slot invariant fails', async () => {
    const client = getTestServiceClient()
    const fixture = await createPartySlotFixture(tenant)

    const { error } = await client.rpc('save_party_slots_atomic', {
      p_guild_id: tenant.guildId,
      p_event_id: fixture.eventId,
      p_party_number: 1,
      p_party_id: fixture.partyId,
      p_expected_version: 0,
      p_party_meta: regularPartyMeta(),
      p_slots: [{
        id: fixture.slotAId,
        slot_number: 1,
        role_name: 'EngageDps',
        is_hidden: false,
        is_solo_bomb: true,
      }],
    })
    expect(error?.message).toContain('SOLO_BOMB_REQUIRES_BOMB_SQUAD_PARTY')

    const [{ data: party }, { data: slots }] = await Promise.all([
      client
        .from('parties')
        .select('slots_version')
        .eq('guild_id', tenant.guildId)
        .eq('id', fixture.partyId)
        .single(),
      client
        .from('slots')
        .select('id, slot_number')
        .eq('guild_id', tenant.guildId)
        .eq('party_id', fixture.partyId)
        .order('slot_number'),
    ])
    expect(party?.slots_version).toBe(0)
    expect(slots).toEqual([
      { id: fixture.slotAId, slot_number: 1 },
      { id: fixture.slotBId, slot_number: 2 },
      { id: fixture.removedSlotId, slot_number: 3 },
    ])
  })

  it('cannot use another tenant id to mutate the party', async () => {
    const client = getTestServiceClient()
    const fixture = await createPartySlotFixture(tenant)
    const otherTenant = await createTestTenant('atomic-party-slots-other')
    try {
      const { error } = await client.rpc('save_party_slots_atomic', {
        p_guild_id: otherTenant.guildId,
        p_event_id: fixture.eventId,
        p_party_number: 1,
        p_party_id: fixture.partyId,
        p_expected_version: 0,
        p_party_meta: regularPartyMeta(),
        p_slots: [],
      })
      expect(error?.message).toContain('EVENT_NOT_FOUND')

      const { data: slots } = await client
        .from('slots')
        .select('id')
        .eq('guild_id', tenant.guildId)
        .eq('party_id', fixture.partyId)
      expect(slots).toHaveLength(3)
    } finally {
      await otherTenant.cleanup()
    }
  })
})
