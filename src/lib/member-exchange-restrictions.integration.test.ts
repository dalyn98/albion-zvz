import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('member exchange restrictions and video gate (migs 288-290)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('exchange-restriction-a')
    tenantB = await createTestTenant('exchange-restriction-b')
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  async function createMember(guildId: string, discordId: string): Promise<void> {
    const { error } = await getTestServiceClient().from('guild_avatars').insert({
      guild_id: guildId,
      discord_id: discordId,
      username: `Member ${discordId}`,
      avatar: null,
    })
    expect(error).toBeNull()
  }

  async function submitGameplayVideo(
    guildId: string,
    discordId: string,
    youtubeVideoId: string,
  ): Promise<void> {
    const { error } = await getTestServiceClient().rpc('submit_member_gameplay_video', {
      p_guild_id: guildId,
      p_discord_id: discordId,
      p_youtube_video_id: youtubeVideoId,
      p_video_url: `https://www.youtube.com/embed/${youtubeVideoId}`,
    })
    expect(error).toBeNull()
  }

  it('seeds participation compliance for a self-serve tenant', async () => {
    const client = getTestServiceClient()
    const [{ data: setting }, { data: policy }] = await Promise.all([
      client
        .from('app_settings')
        .select('value')
        .eq('guild_id', tenantA.guildId)
        .eq('key', 'alliance_content_compliance_enabled')
        .single(),
      client
        .from('alliance_content_policies')
        .select('guild_id, session_target_enabled, participation_days_target_enabled, weekly_min_participation_days')
        .eq('guild_id', tenantA.guildId)
        .single(),
    ])

    expect(setting?.value).toBe('true')
    expect(policy?.guild_id).toBe(tenantA.guildId)
    expect(policy).toMatchObject({
      session_target_enabled: true,
      participation_days_target_enabled: false,
      weekly_min_participation_days: 0,
    })
  })

  it('enforces valid participation target combinations per tenant policy', async () => {
    const client = getTestServiceClient()
    const { error: disabledError } = await client
      .from('alliance_content_policies')
      .update({
        session_target_enabled: false,
        participation_days_target_enabled: false,
      })
      .eq('guild_id', tenantA.guildId)
    expect(disabledError).not.toBeNull()

    const { error: zeroDaysError } = await client
      .from('alliance_content_policies')
      .update({
        session_target_enabled: false,
        participation_days_target_enabled: true,
        weekly_min_participation_days: 0,
      })
      .eq('guild_id', tenantA.guildId)
    expect(zeroDaysError).not.toBeNull()

    const { error: validError } = await client
      .from('alliance_content_policies')
      .update({
        session_target_enabled: false,
        participation_days_target_enabled: true,
        weekly_min_participation_days: 3,
      })
      .eq('guild_id', tenantA.guildId)
    expect(validError).toBeNull()
  })

  it('blocks only new requests for the selected member and tenant until lifted', async () => {
    const client = getTestServiceClient()
    const discordId = 'restricted-member'
    await createMember(tenantA.guildId, discordId)
    await createMember(tenantB.guildId, discordId)
    await submitGameplayVideo(tenantA.guildId, discordId, 'videoGateA1')
    await submitGameplayVideo(tenantB.guildId, discordId, 'videoGateB1')

    const { error: restrictionError } = await client.rpc(
      'set_member_exchange_restriction',
      {
        p_guild_id: tenantA.guildId,
        p_discord_id: discordId,
        p_blocked_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        p_reason: 'Manual review',
        p_actor: 'officer-1',
      },
    )
    expect(restrictionError).toBeNull()

    const { error: blockedError } = await client.from('exchange_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: discordId,
      username: 'Restricted Member',
      silver: 100,
    })
    expect(blockedError?.message).toContain('EXCHANGE_TEMPORARILY_RESTRICTED')

    const { error: otherTenantError } = await client.from('exchange_requests').insert({
      guild_id: tenantB.guildId,
      discord_id: discordId,
      username: 'Restricted Member',
      silver: 100,
    })
    expect(otherTenantError).toBeNull()

    const { error: clearError } = await client.rpc(
      'clear_member_exchange_restriction',
      {
        p_guild_id: tenantA.guildId,
        p_discord_id: discordId,
      },
    )
    expect(clearError).toBeNull()

    const { error: unblockedError } = await client.from('exchange_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: discordId,
      username: 'Restricted Member',
      silver: 100,
    })
    expect(unblockedError).toBeNull()
  })

  it('requires a tenant-scoped gameplay video from the preceding five days', async () => {
    const client = getTestServiceClient()
    const eligibleDiscordId = 'video-eligible-member'
    const otherDiscordId = 'video-missing-member'
    await createMember(tenantA.guildId, eligibleDiscordId)
    await createMember(tenantA.guildId, otherDiscordId)
    await createMember(tenantB.guildId, eligibleDiscordId)

    const { error: missingVideoError } = await client.from('exchange_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: eligibleDiscordId,
      username: 'Video Eligible Member',
      silver: 100,
    })
    expect(missingVideoError?.message).toContain('EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED')

    await submitGameplayVideo(tenantA.guildId, eligibleDiscordId, 'recentVid01')

    const { error: eligibleError } = await client.from('exchange_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: eligibleDiscordId,
      username: 'Video Eligible Member',
      silver: 100,
    })
    expect(eligibleError).toBeNull()

    const { error: otherMemberError } = await client.from('exchange_requests').insert({
      guild_id: tenantA.guildId,
      discord_id: otherDiscordId,
      username: 'Video Missing Member',
      silver: 100,
    })
    expect(otherMemberError?.message).toContain('EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED')

    const { error: otherTenantError } = await client.from('exchange_requests').insert({
      guild_id: tenantB.guildId,
      discord_id: eligibleDiscordId,
      username: 'Video Eligible Member',
      silver: 100,
    })
    expect(otherTenantError?.message).toContain('EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED')
  })

  it('stores a bounded optional reflection through the five-argument registration RPC', async () => {
    const client = getTestServiceClient()
    const discordId = 'reflection-member'
    await createMember(tenantA.guildId, discordId)

    const { data: uploadId, error } = await client.rpc('submit_member_gameplay_video', {
      p_guild_id: tenantA.guildId,
      p_discord_id: discordId,
      p_youtube_video_id: 'reflectV001',
      p_video_url: 'https://www.youtube.com/embed/reflectV001',
      p_reflection_note: '  Improve positioning at 03:20.  ',
    })
    expect(error).toBeNull()

    const { data: upload } = await client
      .from('member_gameplay_video_uploads')
      .select('reflection_note')
      .eq('guild_id', tenantA.guildId)
      .eq('id', uploadId as string)
      .single()
    expect(upload?.reflection_note).toBe('Improve positioning at 03:20.')
  })

  it('rejects a cross-tenant target member', async () => {
    const client = getTestServiceClient()
    await createMember(tenantA.guildId, 'tenant-a-member')

    const { error } = await client.rpc('set_member_exchange_restriction', {
      p_guild_id: tenantB.guildId,
      p_discord_id: 'tenant-a-member',
      p_blocked_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      p_reason: 'Forged tenant',
      p_actor: 'officer-1',
    })

    expect(error?.message).toContain('MEMBER_NOT_FOUND')
  })
})
