import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('global access preferences (migration 351)', () => {
  let first: TestTenant
  let second: TestTenant
  let discordId: string

  beforeEach(async () => {
    discordId = `global-preference-${crypto.randomUUID()}`
    first = await createTestTenant(`global-pref-a-${crypto.randomUUID().slice(0, 6)}`)
    second = await createTestTenant(`global-pref-b-${crypto.randomUUID().slice(0, 6)}`)
    const client = getTestServiceClient()
    expect((await client.from('guild_avatars').insert({
      guild_id: first.guildId,
      discord_id: discordId,
      username: 'First membership',
      avatar: null,
      preferred_language: 'ko',
      timezone: 'Asia/Seoul',
      discord_dm_enabled: true,
    })).error).toBeNull()
    expect((await client.from('guild_avatars').insert({
      guild_id: second.guildId,
      discord_id: discordId,
      username: 'Second membership',
      avatar: null,
      preferred_language: 'en',
      timezone: 'America/New_York',
      discord_dm_enabled: false,
    })).error).toBeNull()
  })

  afterEach(async () => {
    await second?.cleanup()
    await first?.cleanup()
  })

  it('uses one personal language and timezone across multiple guild memberships', async () => {
    const client = getTestServiceClient()
    const preferences = await client.from('global_access_preferences')
      .select('preferred_language,timezone')
      .eq('provider', 'discord')
      .eq('subject', discordId)
      .single()
    expect(preferences.error).toBeNull()
    expect(preferences.data).toEqual({
      preferred_language: 'ko',
      timezone: 'Asia/Seoul',
    })

    const memberships = await client.from('guild_avatars')
      .select('guild_id,preferred_language,timezone,discord_dm_enabled')
      .eq('discord_id', discordId)
    expect(memberships.error).toBeNull()
    expect(memberships.data).toHaveLength(2)
    for (const membership of memberships.data ?? []) {
      expect(membership.preferred_language).toBe('ko')
      expect(membership.timezone).toBe('Asia/Seoul')
    }
    expect(new Set(memberships.data?.map((row) => row.discord_dm_enabled))).toEqual(
      new Set([true, false]),
    )
  })

  it('projects an explicit RPC choice and supports resetting to the guild timezone', async () => {
    const client = getTestServiceClient()
    const changed = await client.rpc('set_global_access_preferences', {
      p_provider: 'discord',
      p_subject: discordId,
      p_preferred_language: 'ja',
      p_timezone: null,
      p_update_language: true,
      p_update_timezone: true,
    })
    expect(changed.error).toBeNull()
    expect(changed.data).toEqual({ preferredLanguage: 'ja', timezone: null })

    const memberships = await client.from('guild_avatars')
      .select('preferred_language,timezone')
      .eq('discord_id', discordId)
    expect(memberships.error).toBeNull()
    expect(memberships.data).toHaveLength(2)
    for (const membership of memberships.data ?? []) {
      expect(membership).toEqual({ preferred_language: 'ja', timezone: null })
    }

    const retry = await client.rpc('set_global_access_preferences', {
      p_provider: 'discord',
      p_subject: discordId,
      p_preferred_language: 'ja',
      p_timezone: null,
      p_update_language: true,
      p_update_timezone: true,
    })
    expect(retry.error).toBeNull()
    expect(retry.data).toEqual(changed.data)
  })

  it('keeps legacy writes compatible without allowing direct global table mutation', async () => {
    const client = getTestServiceClient()
    const legacy = await client.from('guild_avatars')
      .update({ preferred_language: 'zh' })
      .eq('guild_id', second.guildId)
      .eq('discord_id', discordId)
    expect(legacy.error).toBeNull()

    const all = await client.from('guild_avatars')
      .select('preferred_language')
      .eq('discord_id', discordId)
    expect(all.error).toBeNull()
    expect(all.data?.map((row) => row.preferred_language)).toEqual(['zh', 'zh'])

    const direct = await client.from('global_access_preferences')
      .update({ preferred_language: 'en' })
      .eq('provider', 'discord')
      .eq('subject', discordId)
    expect(direct.error?.code).toBe('42501')
  })
})
