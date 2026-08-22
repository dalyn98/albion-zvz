import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  getValidatedTestSupabaseEnv,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('Albion identity resource exception tenant boundary', () => {
  let firstTenant: TestTenant
  let secondTenant: TestTenant

  beforeEach(async () => {
    firstTenant = await createTestTenant(`albion-exception-a-${crypto.randomUUID().slice(0, 8)}`)
    secondTenant = await createTestTenant(`albion-exception-b-${crypto.randomUUID().slice(0, 8)}`)
  })

  afterEach(async () => {
    await secondTenant?.cleanup()
    await firstTenant?.cleanup()
  })

  it('allows the same Discord identity in different tenants but rejects duplicate player bindings inside one tenant', async () => {
    const service = getTestServiceClient()
    const discordId = '839318087542636545'
    const playerId = `resource-exception-${crypto.randomUUID()}`
    const base = {
      discord_id: discordId,
      albion_server: 'east',
      albion_player_id: playerId,
      albion_player_name: 'ExceptionPlayer',
      reason: 'integration test exception',
      granted_by_discord_id: 'integration-super-admin',
    }

    const first = await service.from('albion_identity_resource_exceptions').insert({
      ...base,
      guild_id: firstTenant.guildId,
    })
    expect(first.error).toBeNull()

    const second = await service.from('albion_identity_resource_exceptions').insert({
      ...base,
      guild_id: secondTenant.guildId,
    })
    expect(second.error).toBeNull()

    const duplicatePlayer = await service
      .from('albion_identity_resource_exceptions')
      .insert({
        ...base,
        guild_id: firstTenant.guildId,
        discord_id: '849318087542636545',
      })
    expect(duplicatePlayer.error?.code).toBe('23505')
  })

  it('denies direct anonymous reads while keeping service-role access', async () => {
    const env = getValidatedTestSupabaseEnv()
    expect(env).not.toBeNull()
    if (!env) return
    const anonKey = process.env.TEST_SUPABASE_ANON_KEY?.trim()
    if (!anonKey) return

    const service = getTestServiceClient()
    const anonymous = createClient(env.url, anonKey, {
      auth: { persistSession: false },
    })
    const serviceRead = await service
      .from('albion_identity_resource_exceptions')
      .select('*')
      .limit(1)
    expect(serviceRead.error).toBeNull()

    const anonRead = await anonymous
      .from('albion_identity_resource_exceptions')
      .select('*')
      .limit(1)
    expect(anonRead.error).not.toBeNull()
    expect(anonRead.error?.code).toBe('42501')
  })
})
