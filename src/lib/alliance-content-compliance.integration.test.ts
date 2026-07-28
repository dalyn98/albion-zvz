import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('alliance content compliance tenant constraints (mig 255)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('alliance-content-a')
    tenantB = await createTestTenant('alliance-content-b')
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('deduplicates a YouTube source within a tenant but not across tenants', async () => {
    const client = getTestServiceClient()
    const videoId = 'dQw4w9WgXcQ'
    const first = await createRequirement(client, tenantA.guildId, 'member-a')
    const second = await createRequirement(client, tenantA.guildId, 'member-b')
    const otherTenant = await createRequirement(client, tenantB.guildId, 'member-c')

    const { error: firstInsertError } = await client.from('alliance_content_video_submissions').insert({
      guild_id: tenantA.guildId,
      requirement_id: first.requirementId,
      session_id: first.sessionId,
      discord_id: 'member-a',
      youtube_video_id: videoId,
      video_url: `https://www.youtube.com/embed/${videoId}`,
    })
    expect(firstInsertError).toBeNull()

    const { error: duplicateError } = await client.from('alliance_content_video_submissions').insert({
      guild_id: tenantA.guildId,
      requirement_id: second.requirementId,
      session_id: second.sessionId,
      discord_id: 'member-b',
      youtube_video_id: videoId,
      video_url: `https://www.youtube.com/embed/${videoId}`,
    })
    expect(duplicateError?.code).toBe('23505')

    const { error: otherTenantError } = await client.from('alliance_content_video_submissions').insert({
      guild_id: tenantB.guildId,
      requirement_id: otherTenant.requirementId,
      session_id: otherTenant.sessionId,
      discord_id: 'member-c',
      youtube_video_id: videoId,
      video_url: `https://www.youtube.com/embed/${videoId}`,
    })
    expect(otherTenantError).toBeNull()
  })
})

describeIntegration('alliance content participation duties (migs 258, 267)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('alliance-content-manual')
    const client = getTestServiceClient()

    const { error: settingError } = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'alliance_content_compliance_enabled',
      value: 'true',
    }, { onConflict: 'guild_id,key' })
    expect(settingError).toBeNull()

    const { error: policyError } = await client.from('alliance_content_policies').upsert({
      guild_id: tenant.guildId,
    }, { onConflict: 'guild_id' })
    expect(policyError).toBeNull()
  })

  afterEach(async () => {
    const client = getTestServiceClient()
    await client.from('app_settings').delete().eq('guild_id', tenant.guildId)
    await tenant?.cleanup()
  })

  it('adds one active member once, records its source, and rebuilds unfinished three-session duties', async () => {
    const client = getTestServiceClient()
    const { data: sessions, error: sessionError } = await client
      .from('alliance_content_sessions')
      .insert([0, 1, 2, 3].map((offset) => ({
        guild_id: tenant.guildId,
        started_at: `2026-07-${String(10 + offset).padStart(2, '0')}T10:00:00.000Z`,
        ended_at: `2026-07-${String(10 + offset).padStart(2, '0')}T11:00:00.000Z`,
        confirmed_by_discord_id: 'officer-1',
      })))
      .select('id, ended_at')
    expect(sessionError).toBeNull()
    const orderedSessions = [...(sessions ?? [])].sort((left, right) => left.ended_at.localeCompare(right.ended_at))

    const { error: avatarError } = await client.from('guild_avatars').insert({
      guild_id: tenant.guildId,
      discord_id: 'member-1',
      username: 'Manual Member',
      albion_player_id: 'albion-member-1',
    })
    expect(avatarError).toBeNull()

    const { error: existingParticipationError } = await client
      .from('alliance_content_participations')
      .insert(orderedSessions.slice(1).map((session) => ({
        guild_id: tenant.guildId,
        session_id: session.id,
        discord_id: 'member-1',
        albion_player_id: 'albion-member-1',
      })))
    expect(existingParticipationError).toBeNull()

    const { data: initialRequirementCount, error: initialRefreshError } = await client.rpc(
      'refresh_alliance_content_video_requirements',
      { p_guild_id: tenant.guildId, p_discord_id: 'member-1' },
    )
    expect(initialRefreshError).toBeNull()
    expect(initialRequirementCount).toBe(1)

    const args = {
      p_guild_id: tenant.guildId,
      p_session_id: orderedSessions[0].id,
      p_discord_id: 'member-1',
    }
    const { data: firstAdded, error: firstError } = await client.rpc(
      'add_alliance_content_manual_participation',
      args,
    )
    expect(firstError).toBeNull()
    expect(firstAdded).toBe(true)

    const { data: duplicateAdded, error: duplicateError } = await client.rpc(
      'add_alliance_content_manual_participation',
      args,
    )
    expect(duplicateError).toBeNull()
    expect(duplicateAdded).toBe(false)

    const { data: participations, error: participationError } = await client
      .from('alliance_content_participations')
      .select('discord_id, source')
      .eq('guild_id', tenant.guildId)
      .eq('session_id', orderedSessions[0].id)
    expect(participationError).toBeNull()
    expect(participations).toEqual([{ discord_id: 'member-1', source: 'admin_override' }])

    const { data: requirements, error: requirementError } = await client
      .from('alliance_content_video_requirements')
      .select('id')
      .eq('guild_id', tenant.guildId)
      .eq('discord_id', 'member-1')
    expect(requirementError).toBeNull()
    expect(requirements).toHaveLength(1)

    const { data: links, error: linkError } = await client
      .from('alliance_content_video_requirement_sessions')
      .select('session_id')
      .eq('guild_id', tenant.guildId)
      .eq('requirement_id', requirements![0].id)
    expect(linkError).toBeNull()
    expect(links?.map((link) => link.session_id).sort()).toEqual(
      orderedSessions.slice(0, 3).map((session) => session.id).sort(),
    )
  })

  it('creates independent video duties for multiple members who share the same three sessions', async () => {
    const client = getTestServiceClient()
    const memberDiscordIds = ['member-shared-a', 'member-shared-b']
    const { data: sessions, error: sessionError } = await client
      .from('alliance_content_sessions')
      .insert([0, 1, 2].map((offset) => ({
        guild_id: tenant.guildId,
        started_at: `2026-07-${String(20 + offset).padStart(2, '0')}T10:00:00.000Z`,
        ended_at: `2026-07-${String(20 + offset).padStart(2, '0')}T11:00:00.000Z`,
        confirmed_by_discord_id: 'officer-1',
      })))
      .select('id')
    expect(sessionError).toBeNull()

    const { error: participationError } = await client
      .from('alliance_content_participations')
      .insert(memberDiscordIds.flatMap((discordId) => (sessions ?? []).map((session) => ({
        guild_id: tenant.guildId,
        session_id: session.id,
        discord_id: discordId,
        albion_player_id: `albion-${discordId}`,
      }))))
    expect(participationError).toBeNull()

    for (const discordId of memberDiscordIds) {
      const { data: createdCount, error } = await client.rpc(
        'refresh_alliance_content_video_requirements',
        { p_guild_id: tenant.guildId, p_discord_id: discordId },
      )
      expect(error).toBeNull()
      expect(createdCount).toBe(1)
    }

    const { data: requirements, error: requirementError } = await client
      .from('alliance_content_video_requirements')
      .select('id, discord_id')
      .eq('guild_id', tenant.guildId)
      .in('discord_id', memberDiscordIds)
    expect(requirementError).toBeNull()
    expect(requirements).toHaveLength(2)

    const requirementIds = (requirements ?? []).map((requirement) => requirement.id)
    const { data: links, error: linkError } = await client
      .from('alliance_content_video_requirement_sessions')
      .select('requirement_id, session_id')
      .eq('guild_id', tenant.guildId)
      .in('requirement_id', requirementIds)
    expect(linkError).toBeNull()
    expect(links).toHaveLength(6)
    expect(new Set(links?.map((link) => link.session_id))).toEqual(
      new Set((sessions ?? []).map((session) => session.id)),
    )
  })
})

describeIntegration('alliance content video from regear (migs 260-261)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('alliance-content-regear-a')
    tenantB = await createTestTenant('alliance-content-regear-b')
    const client = getTestServiceClient()

    const { error: settingError } = await client.from('app_settings').upsert({
      guild_id: tenantA.guildId,
      key: 'alliance_content_compliance_enabled',
      value: 'true',
    }, { onConflict: 'guild_id,key' })
    expect(settingError).toBeNull()
  })

  afterEach(async () => {
    const client = getTestServiceClient()
    await client.from('app_settings').delete().eq('guild_id', tenantA.guildId)
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('submits one regear proof idempotently and rejects a cross-tenant source', async () => {
    const client = getTestServiceClient()
    const memberDiscordId = 'regear-member'
    const videoId = 'oHg5SJYRHA0'
    const source = await createRegearRequest(
      client,
      tenantA.guildId,
      memberDiscordId,
      videoId,
    )
    const foreignSource = await createRegearRequest(
      client,
      tenantB.guildId,
      memberDiscordId,
      'dQw4w9WgXcQ',
    )
    const requirement = await createRequirement(
      client,
      tenantA.guildId,
      memberDiscordId,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    )
    const args = {
      p_guild_id: tenantA.guildId,
      p_regear_request_id: source.id,
      p_requirement_id: requirement.requirementId,
      p_session_id: requirement.sessionId,
      p_discord_id: memberDiscordId,
    }

    const first = await client.rpc('submit_alliance_content_video_from_regear', args)
    expect(first.error).toBeNull()

    const repeated = await client.rpc('submit_alliance_content_video_from_regear', args)
    expect(repeated.error).toBeNull()
    expect(repeated.data).toBe(first.data)

    const { data: submission, error: submissionError } = await client
      .from('alliance_content_video_submissions')
      .select('submission_source, source_regear_request_id, youtube_video_id, status')
      .eq('guild_id', tenantA.guildId)
      .eq('requirement_id', requirement.requirementId)
      .single()
    expect(submissionError).toBeNull()
    expect(submission).toEqual({
      submission_source: 'regear',
      source_regear_request_id: source.id,
      youtube_video_id: videoId,
      status: 'pending',
    })

    const crossTenant = await client.rpc('submit_alliance_content_video_from_regear', {
      ...args,
      p_regear_request_id: foreignSource.id,
    })
    expect(crossTenant.error?.message).toContain('ALLIANCE_CONTENT_REGEAR_NOT_FOUND')
  })
})

async function createRequirement(
  client: ReturnType<typeof getTestServiceClient>,
  guildId: string,
  discordId: string,
  dueAt = '2026-07-20T11:00:00.000Z',
): Promise<{ requirementId: string; sessionId: string }> {
  const { data: session, error: sessionError } = await client
    .from('alliance_content_sessions')
    .insert({
      guild_id: guildId,
      started_at: '2026-07-13T10:00:00.000Z',
      ended_at: '2026-07-13T11:00:00.000Z',
      confirmed_by_discord_id: 'admin',
    })
    .select('id')
    .single()
  expect(sessionError).toBeNull()

  const { data: requirement, error: requirementError } = await client
    .from('alliance_content_video_requirements')
    .insert({
      guild_id: guildId,
      discord_id: discordId,
      due_at: dueAt,
    })
    .select('id')
    .single()
  expect(requirementError).toBeNull()

  const { error: linkError } = await client.from('alliance_content_video_requirement_sessions').insert({
    guild_id: guildId,
    requirement_id: requirement!.id,
    session_id: session!.id,
  })
  expect(linkError).toBeNull()

  return { requirementId: requirement!.id, sessionId: session!.id }
}

async function createRegearRequest(
  client: ReturnType<typeof getTestServiceClient>,
  guildId: string,
  discordId: string,
  videoId: string,
): Promise<{ id: string }> {
  const { data, error } = await client
    .from('regear_requests')
    .insert({
      guild_id: guildId,
      event_id: null,
      event_title_snapshot: 'Alliance regear source',
      discord_id: discordId,
      username: discordId,
      role_name: 'Dps',
      silver: 1000,
      claimed_silver: 1000,
      video_proof_url: `https://www.youtube.com/embed/${videoId}`,
      auto_generated: false,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return { id: data!.id }
}
