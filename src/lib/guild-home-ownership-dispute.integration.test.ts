import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('guild home ownership dispute lifecycle', () => {
  let incumbent: TestTenant
  let claimant: TestTenant
  let albionGuildId: string

  beforeEach(async () => {
    incumbent = await createTestTenant('ownership-incumbent')
    claimant = await createTestTenant('ownership-claimant')
    albionGuildId = `albion-guild-${crypto.randomUUID()}`
    const { error } = await getTestServiceClient()
      .from('app_settings')
      .upsert([
        {
          guild_id: incumbent.guildId,
          key: 'albion_server',
          value: 'west',
        },
        {
          guild_id: incumbent.guildId,
          key: 'albion_home_guild_id',
          value: albionGuildId,
        },
        {
          guild_id: incumbent.guildId,
          key: 'albion_home_guild_name',
          value: 'Incumbent Guild',
        },
        {
          guild_id: incumbent.guildId,
          key: 'guild_profile_enabled',
          value: 'true',
        },
      ], { onConflict: 'guild_id,key' })
    expect(error).toBeNull()
  })

  afterEach(async () => {
    await incumbent?.cleanup()
    await claimant?.cleanup()
  })

  async function submitDispute() {
    return getTestServiceClient().rpc('submit_guild_home_ownership_dispute', {
      p_claimant_guild_id: claimant.guildId,
      p_albion_server: 'west',
      p_albion_guild_id: albionGuildId,
      p_albion_guild_name: 'Incumbent Guild',
      p_reporter_discord_id: 'reporter-1',
      p_evidence_summary: 'Public recruitment and guild management evidence.',
    })
  }

  it('keeps a submitted report non-disruptive until explicit review starts', async () => {
    const client = getTestServiceClient()
    const first = await submitDispute()
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({ status: 'submitted', created: true })

    const retry = await submitDispute()
    expect(retry.error).toBeNull()
    expect(retry.data).toMatchObject({ status: 'submitted', created: false })
    expect(retry.data.id).toBe(first.data.id)

    const submitted = await client
      .from('guild_home_ownership_disputes')
      .select('status,evidence_summary')
      .eq('id', first.data.id)
      .single()
    expect(submitted.error).toBeNull()
    expect(submitted.data?.status).toBe('submitted')

    const profileBeforeReview = await client
      .from('app_settings')
      .select('value')
      .eq('guild_id', incumbent.guildId)
      .eq('key', 'guild_profile_enabled')
      .single()
    expect(profileBeforeReview.data?.value).toBe('true')

    const review = await client.rpc('review_guild_home_ownership_dispute', {
      p_dispute_id: first.data.id,
      p_action: 'start_review',
      p_reviewer_discord_id: 'operator-1',
      p_resolution_note: '',
    })
    expect(review.error).toBeNull()
    expect(review.data).toMatchObject({ status: 'under_review', changed: true })

    const resolution = await client.rpc('review_guild_home_ownership_dispute', {
      p_dispute_id: first.data.id,
      p_action: 'keep_existing',
      p_reviewer_discord_id: 'operator-1',
      p_resolution_note: 'Existing public recruitment evidence is authoritative.',
    })
    expect(resolution.error).toBeNull()
    expect(resolution.data).toMatchObject({
      status: 'resolved_existing',
      homeGuildReassigned: false,
    })

    const closed = await client
      .from('guild_home_ownership_disputes')
      .select('status,evidence_summary,evidence_purged_at,resolution_note')
      .eq('id', first.data.id)
      .single()
    expect(closed.data).toMatchObject({
      status: 'resolved_existing',
      evidence_summary: null,
      evidence_purged_at: expect.any(String),
      resolution_note: 'Existing public recruitment evidence is authoritative.',
    })
  })

  it('reassigns only the official home link and preserves tenant-owned records', async () => {
    const client = getTestServiceClient()
    const { error: avatarError } = await client.from('guild_avatars').insert([
      {
        guild_id: incumbent.guildId,
        discord_id: 'incumbent-member',
        username: 'Incumbent Member',
      },
      {
        guild_id: claimant.guildId,
        discord_id: 'claimant-member',
        username: 'Claimant Member',
      },
    ])
    expect(avatarError).toBeNull()

    const submitted = await submitDispute()
    expect(submitted.error).toBeNull()
    expect((await client.rpc('review_guild_home_ownership_dispute', {
      p_dispute_id: submitted.data.id,
      p_action: 'start_review',
      p_reviewer_discord_id: 'operator-2',
      p_resolution_note: '',
    })).error).toBeNull()

    const reassigned = await client.rpc('review_guild_home_ownership_dispute', {
      p_dispute_id: submitted.data.id,
      p_action: 'reassign',
      p_reviewer_discord_id: 'operator-2',
      p_resolution_note: 'Claimant provided stronger current guild management evidence.',
    })
    expect(reassigned.error).toBeNull()
    expect(reassigned.data).toMatchObject({
      status: 'resolved_reassigned',
      homeGuildReassigned: true,
    })

    const { data: settings } = await client
      .from('app_settings')
      .select('guild_id,key,value')
      .in('guild_id', [incumbent.guildId, claimant.guildId])
      .in('key', ['albion_server', 'albion_home_guild_id', 'albion_home_guild_name', 'guild_profile_enabled'])
    const setting = (guildId: string, key: string) =>
      settings?.find((row) => row.guild_id === guildId && row.key === key)?.value
    expect(setting(incumbent.guildId, 'albion_home_guild_id')).toBe('')
    expect(setting(incumbent.guildId, 'albion_home_guild_name')).toBe('')
    expect(setting(incumbent.guildId, 'guild_profile_enabled')).toBe('false')
    expect(setting(claimant.guildId, 'albion_home_guild_id')).toBe(albionGuildId)
    expect(setting(claimant.guildId, 'albion_home_guild_name')).toBe('Incumbent Guild')

    const feature = await client
      .from('guild_feature_states')
      .select('state')
      .eq('guild_id', incumbent.guildId)
      .eq('feature_key', 'public_guild_profile')
      .single()
    expect(feature.data?.state).toBe('setup_required')

    const avatars = await client
      .from('guild_avatars')
      .select('guild_id,discord_id')
      .in('guild_id', [incumbent.guildId, claimant.guildId])
    expect(avatars.data).toEqual(expect.arrayContaining([
      { guild_id: incumbent.guildId, discord_id: 'incumbent-member' },
      { guild_id: claimant.guildId, discord_id: 'claimant-member' },
    ]))
  })

  it('blocks direct service-role mutation of dispute rows', async () => {
    const client = getTestServiceClient()
    const submitted = await submitDispute()
    expect(submitted.error).toBeNull()
    const direct = await client
      .from('guild_home_ownership_disputes')
      .update({ status: 'under_review' })
      .eq('id', submitted.data.id)
    expect(direct.error).not.toBeNull()
  })
})
