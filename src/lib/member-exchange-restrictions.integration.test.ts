import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  enableTestTenantFeatures,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('member exchange restrictions and Menhera video gate (migs 288-296)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant
  let restoreMenheraSlug: (() => Promise<void>) | undefined

  beforeEach(async () => {
    tenantA = await createTestTenant('exchange-restriction-a')
    tenantB = await createTestTenant('exchange-restriction-b')
    await Promise.all([
      enableTestTenantFeatures(tenantA.guildId, ['guild_economy']),
      enableTestTenantFeatures(tenantB.guildId, ['guild_economy']),
    ])
  })

  afterEach(async () => {
    await restoreMenheraSlug?.()
    restoreMenheraSlug = undefined
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

  async function seedPoints(guildId: string, discordId: string, points = 100): Promise<void> {
    const { error } = await getTestServiceClient().from('point_ledger').insert({
      guild_id: guildId,
      discord_id: discordId,
      delta: points,
      reason: 'admin_adjust',
      memo: 'exchange restriction fixture',
    })
    expect(error).toBeNull()
  }

  function heldExchangeRequest(
    guildId: string,
    discordId: string,
    username: string,
    silver = 100,
  ) {
    return {
      guild_id: guildId,
      discord_id: discordId,
      username,
      silver,
      held_points: silver,
      hold_status: 'held',
      held_at: new Date().toISOString(),
    }
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

  async function enableMenheraContentCompliance(): Promise<void> {
    const client = getTestServiceClient()
    restoreMenheraSlug = await leaseMenheraSlug(client, tenantA.guildId)

    const [{ error: settingError }, { error: policyError }] = await Promise.all([
      client.from('app_settings').upsert({
        guild_id: tenantA.guildId,
        key: 'alliance_content_compliance_enabled',
        value: 'true',
      }, { onConflict: 'guild_id,key' }),
      client.from('alliance_content_policies').upsert({
        guild_id: tenantA.guildId,
      }, { onConflict: 'guild_id' }),
    ])
    expect(settingError).toBeNull()
    expect(policyError).toBeNull()
  }

  it('does not bootstrap participation compliance for a self-serve tenant', async () => {
    const client = getTestServiceClient()
    const [
      { data: setting, error: settingError },
      { data: policy, error: policyError },
      { data: enabled, error: resolverError },
    ] = await Promise.all([
      client
        .from('app_settings')
        .select('value')
        .eq('guild_id', tenantA.guildId)
        .eq('key', 'alliance_content_compliance_enabled')
        .maybeSingle(),
      client
        .from('alliance_content_policies')
        .select('guild_id')
        .eq('guild_id', tenantA.guildId)
        .maybeSingle(),
      client.rpc('alliance_content_compliance_enabled', {
        p_guild_id: tenantA.guildId,
      }),
    ])

    expect(settingError).toBeNull()
    expect(policyError).toBeNull()
    expect(resolverError).toBeNull()
    expect(setting).toBeNull()
    expect(policy).toBeNull()
    expect(enabled).toBe(false)
  })

  it('enforces valid participation target combinations for the enabled Menhera policy', async () => {
    const client = getTestServiceClient()
    await enableMenheraContentCompliance()

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

    const { error: blockedError } = await client
      .from('exchange_requests')
      .insert(heldExchangeRequest(tenantA.guildId, discordId, 'Restricted Member'))
    expect(blockedError?.message).toContain('EXCHANGE_TEMPORARILY_RESTRICTED')

    const { error: otherTenantError } = await client
      .from('exchange_requests')
      .insert(heldExchangeRequest(tenantB.guildId, discordId, 'Restricted Member'))
    expect(otherTenantError).toBeNull()

    const { error: clearError } = await client.rpc(
      'clear_member_exchange_restriction',
      {
        p_guild_id: tenantA.guildId,
        p_discord_id: discordId,
      },
    )
    expect(clearError).toBeNull()

    const { error: unblockedError } = await client
      .from('exchange_requests')
      .insert(heldExchangeRequest(tenantA.guildId, discordId, 'Restricted Member'))
    expect(unblockedError).toBeNull()
  })

  it('requires a tenant-scoped gameplay video from the preceding five days', async () => {
    const client = getTestServiceClient()
    await enableMenheraContentCompliance()

    const eligibleDiscordId = 'video-eligible-member'
    const otherDiscordId = 'video-missing-member'
    await createMember(tenantA.guildId, eligibleDiscordId)
    await createMember(tenantA.guildId, otherDiscordId)
    await createMember(tenantB.guildId, eligibleDiscordId)

    const { error: missingVideoError } = await client
      .from('exchange_requests')
      .insert(heldExchangeRequest(tenantA.guildId, eligibleDiscordId, 'Video Eligible Member'))
    expect(missingVideoError?.message).toContain('EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED')

    await submitGameplayVideo(tenantA.guildId, eligibleDiscordId, 'recentVid01')

    const { error: eligibleError } = await client
      .from('exchange_requests')
      .insert(heldExchangeRequest(tenantA.guildId, eligibleDiscordId, 'Video Eligible Member'))
    expect(eligibleError).toBeNull()

    const { error: otherMemberError } = await client
      .from('exchange_requests')
      .insert(heldExchangeRequest(tenantA.guildId, otherDiscordId, 'Video Missing Member'))
    expect(otherMemberError?.message).toContain('EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED')

    const { error: otherTenantError } = await client
      .from('exchange_requests')
      .insert(heldExchangeRequest(tenantB.guildId, eligibleDiscordId, 'Video Eligible Member'))
    expect(otherTenantError).toBeNull()
  })

  it('allows officers to turn the recent gameplay-video exchange gate off and on', async () => {
    const client = getTestServiceClient()
    await enableMenheraContentCompliance()

    const allowedDiscordId = 'video-toggle-off-member'
    const blockedDiscordId = 'video-toggle-on-member'
    await createMember(tenantA.guildId, allowedDiscordId)
    await createMember(tenantA.guildId, blockedDiscordId)
    await seedPoints(tenantA.guildId, allowedDiscordId)
    await seedPoints(tenantA.guildId, blockedDiscordId)

    const { error: disableError } = await client.from('app_settings').upsert({
      guild_id: tenantA.guildId,
      key: 'exchange_recent_gameplay_video_required',
      value: 'false',
    }, { onConflict: 'guild_id,key' })
    expect(disableError).toBeNull()

    const { error: allowedError } = await client.rpc('submit_exchange_request', {
      p_guild_id: tenantA.guildId,
      p_discord_id: allowedDiscordId,
      p_username: 'Video Toggle Off Member',
      p_silver: 100,
    })
    expect(allowedError).toBeNull()

    const { error: enableError } = await client.from('app_settings').upsert({
      guild_id: tenantA.guildId,
      key: 'exchange_recent_gameplay_video_required',
      value: 'true',
    }, { onConflict: 'guild_id,key' })
    expect(enableError).toBeNull()

    const { error: blockedError } = await client.rpc('submit_exchange_request', {
      p_guild_id: tenantA.guildId,
      p_discord_id: blockedDiscordId,
      p_username: 'Video Toggle On Member',
      p_silver: 100,
    })
    expect(blockedError?.message).toContain('EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED')
  })

  it('rejects non-Menhera video RPCs and ignores a stale enabled setting at exchange time', async () => {
    const client = getTestServiceClient()
    const discordId = 'non-menhera-member'
    await createMember(tenantB.guildId, discordId)

    const { error: settingError } = await client.from('app_settings').upsert({
      guild_id: tenantB.guildId,
      key: 'alliance_content_compliance_enabled',
      value: 'true',
    }, { onConflict: 'guild_id,key' })
    expect(settingError).toBeNull()

    const { data: enabled, error: resolverError } = await client.rpc(
      'alliance_content_compliance_enabled',
      { p_guild_id: tenantB.guildId },
    )
    expect(resolverError).toBeNull()
    expect(enabled).toBe(false)

    const { error: complianceRpcError } = await client.rpc(
      'refresh_alliance_content_video_requirements',
      {
        p_guild_id: tenantB.guildId,
        p_discord_id: discordId,
      },
    )
    expect(complianceRpcError?.message).toContain('ALLIANCE_CONTENT_FEATURE_UNAVAILABLE')

    const { error: uploadError } = await client.rpc('submit_member_gameplay_video', {
      p_guild_id: tenantB.guildId,
      p_discord_id: discordId,
      p_youtube_video_id: 'otherVid001',
      p_video_url: 'https://www.youtube.com/embed/otherVid001',
    })
    expect(uploadError?.message).toContain('MEMBER_GAMEPLAY_VIDEO_FEATURE_UNAVAILABLE')

    const { error: exchangeError } = await client
      .from('exchange_requests')
      .insert(heldExchangeRequest(tenantB.guildId, discordId, 'Non-Menhera Member'))
    expect(exchangeError).toBeNull()
  })

  it('stores a bounded optional reflection through the five-argument registration RPC', async () => {
    const client = getTestServiceClient()
    await enableMenheraContentCompliance()

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

async function leaseMenheraSlug(
  client: ReturnType<typeof getTestServiceClient>,
  testGuildId: string,
): Promise<() => Promise<void>> {
  const { data: existing, error: lookupError } = await client
    .from('tenants')
    .select('id')
    .eq('slug', 'menhera')
    .maybeSingle()
  expect(lookupError).toBeNull()

  if (existing) {
    const { error } = await client
      .from('tenants')
      .update({ slug: `menhera-test-${crypto.randomUUID().slice(0, 8)}` })
      .eq('id', existing.id)
    expect(error).toBeNull()
  }

  const { error: claimError } = await client
    .from('tenants')
    .update({ slug: 'menhera' })
    .eq('id', testGuildId)
  expect(claimError).toBeNull()

  return async () => {
    if (!existing) return

    const { error: releaseError } = await client
      .from('tenants')
      .update({ slug: `released-test-${crypto.randomUUID().slice(0, 8)}` })
      .eq('id', testGuildId)
    expect(releaseError).toBeNull()

    const { error } = await client
      .from('tenants')
      .update({ slug: 'menhera' })
      .eq('id', existing.id)
    expect(error).toBeNull()
  }
}
