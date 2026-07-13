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

async function createRequirement(
  client: ReturnType<typeof getTestServiceClient>,
  guildId: string,
  discordId: string,
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
      due_at: '2026-07-20T11:00:00.000Z',
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
