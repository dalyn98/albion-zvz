import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  sendAdminNotification: vi.fn(),
  sendDiscordDmToUser: vi.fn(),
  isDiscordDmConfigured: vi.fn(),
  loadDiscordDmLocale: vi.fn(),
  getDiscordDmTranslator: vi.fn(),
  discordDeliveryNonce: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

vi.mock('@/lib/admin-notifications', () => ({
  sendAdminNotification: mocks.sendAdminNotification,
}))

vi.mock('@/lib/discord-dm', () => ({
  isDiscordDmConfigured: mocks.isDiscordDmConfigured,
  sendDiscordDmToUser: mocks.sendDiscordDmToUser,
}))

vi.mock('@/lib/discord-dm-localized', () => ({
  loadDiscordDmLocale: mocks.loadDiscordDmLocale,
  getDiscordDmTranslator: mocks.getDiscordDmTranslator,
}))

vi.mock('@/lib/discord-delivery-id', () => ({
  discordDeliveryNonce: mocks.discordDeliveryNonce,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { processDomainOutbox } from './domain-outbox-delivery'

interface TestRow {
  id: string
  guild_id: string
  topic: string
  aggregate_kind: string
  aggregate_id: string
  recipient_kind: 'member' | 'admin' | 'guild' | 'digest'
  recipient_member_id: string | null
  payload: Record<string, unknown>
  claim_token: string
  attempts: number
}

function row(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id: crypto.randomUUID(),
    guild_id: crypto.randomUUID(),
    topic: 'craft.ready_for_pickup',
    aggregate_kind: 'supply_fulfillment',
    aggregate_id: crypto.randomUUID(),
    recipient_kind: 'member',
    recipient_member_id: crypto.randomUUID(),
    payload: { eventTitle: 'CTA', boxNumber: 7, crafterUsername: 'Crafter' },
    claim_token: crypto.randomUUID(),
    attempts: 1,
    ...overrides,
  }
}

function accessQuery(subjectId: string) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.is.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockResolvedValue({
    data: [{ subject_id: subjectId, last_seen_at: '2026-08-01T00:00:00Z' }],
    error: null,
  })
  return query
}

function avatarQuery(subjectId: string) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.is.mockResolvedValue({ data: [{ discord_id: subjectId }], error: null })
  return query
}

describe('domain outbox delivery worker', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.isDiscordDmConfigured.mockReturnValue(true)
    mocks.loadDiscordDmLocale.mockResolvedValue('ko')
    mocks.getDiscordDmTranslator.mockResolvedValue(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
    )
    mocks.discordDeliveryNonce.mockReturnValue('stable-nonce')
  })

  it('resolves the current active Discord identity and completes a member DM', async () => {
    const claimed = row()
    const discordId = '811111111111111111'
    let claimCalls = 0
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_domain_outbox') {
        claimCalls += 1
        return { data: claimCalls === 1 ? [claimed] : [], error: null }
      }
      return { data: true, error: null }
    })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'guild_member_access_identities') return accessQuery(discordId)
      if (table === 'guild_avatars') return avatarQuery(discordId)
      throw new Error(`unexpected table ${table}`)
    })
    mocks.sendDiscordDmToUser.mockResolvedValue({ attempted: 1, succeeded: 1 })

    await expect(processDomainOutbox({ limit: 10 })).resolves.toEqual({
      claimed: 1,
      sent: 1,
      cancelled: 0,
      failed: 0,
    })
    expect(mocks.sendDiscordDmToUser).toHaveBeenCalledWith(
      discordId,
      claimed.guild_id,
      expect.objectContaining({ deliveryNonce: 'stable-nonce' }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('complete_domain_outbox', {
      p_id: claimed.id,
      p_claim_token: claimed.claim_token,
      p_status: 'sent',
      p_error: null,
    })
  })

  it('claims only one concurrent batch at a time so leases do not age in a queue', async () => {
    const rows = Array.from({ length: 6 }, () => row({
      recipient_kind: 'guild',
      recipient_member_id: null,
    }))
    let offset = 0
    mocks.rpc.mockImplementation(async (name: string, args: { p_limit?: number }) => {
      if (name !== 'claim_domain_outbox') return { data: true, error: null }
      const count = args.p_limit ?? 0
      const batch = rows.slice(offset, offset + count)
      offset += batch.length
      return { data: batch, error: null }
    })

    await expect(processDomainOutbox({ limit: 6 })).resolves.toEqual({
      claimed: 6,
      sent: 0,
      cancelled: 6,
      failed: 0,
    })
    const claimLimits = mocks.rpc.mock.calls
      .filter(([name]) => name === 'claim_domain_outbox')
      .map(([, args]) => args.p_limit)
    expect(claimLimits).toEqual([5, 1])
  })

  it('releases a failed external send through the guarded completion RPC', async () => {
    const claimed = row()
    const discordId = '822222222222222222'
    let claimedOnce = false
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_domain_outbox') {
        if (claimedOnce) return { data: [], error: null }
        claimedOnce = true
        return { data: [claimed], error: null }
      }
      return { data: true, error: null }
    })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'guild_member_access_identities') return accessQuery(discordId)
      if (table === 'guild_avatars') return avatarQuery(discordId)
      throw new Error(`unexpected table ${table}`)
    })
    mocks.sendDiscordDmToUser.mockRejectedValue(new Error('Discord unavailable'))

    await expect(processDomainOutbox({ limit: 10 })).resolves.toEqual({
      claimed: 1,
      sent: 0,
      cancelled: 0,
      failed: 1,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('complete_domain_outbox', {
      p_id: claimed.id,
      p_claim_token: claimed.claim_token,
      p_status: 'failed',
      p_error: 'Discord unavailable',
    })
  })
})
