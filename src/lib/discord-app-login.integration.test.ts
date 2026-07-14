import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip
const TOKEN_HASH = 'a'.repeat(64)

describeIntegration('Discord app login attempts (mig 257)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('discord-app-login')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('accepts only hashed tenant attempts and atomically consumes a link once', async () => {
    const client = getTestServiceClient()
    const { data: attempt, error: insertError } = await client
      .from('discord_app_login_attempts')
      .insert({
        guild_id: tenant.guildId,
        discord_id: 'member-1',
        token_hash: TOKEN_HASH,
        return_to: '/me/wallet',
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    const consume = () => client
      .from('discord_app_login_attempts')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', attempt!.id)
      .eq('guild_id', tenant.guildId)
      .eq('token_hash', TOKEN_HASH)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle()

    const first = await consume()
    expect(first.error).toBeNull()
    expect(first.data?.id).toBe(attempt!.id)

    const second = await consume()
    expect(second.error).toBeNull()
    expect(second.data).toBeNull()

    const { error: invalidHashError } = await client
      .from('discord_app_login_attempts')
      .insert({
        guild_id: tenant.guildId,
        discord_id: 'member-2',
        token_hash: 'raw-token',
        return_to: '/',
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
    expect(invalidHashError?.code).toBe('23514')
  })
})
