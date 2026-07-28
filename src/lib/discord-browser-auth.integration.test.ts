import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('Discord browser auth attempts (mig 287)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('discord-browser-auth')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  it('creates, tenant-binds, approves, and atomically consumes a hashed attempt', async () => {
    const client = getTestServiceClient()
    const codeHash = 'a'.repeat(64)
    const browserSecretHash = 'b'.repeat(64)
    const fingerprint = 'c'.repeat(64)
    const { data: created, error: createError } = await client.rpc(
      'create_discord_browser_auth_attempt',
      {
        p_guild_id: tenant.guildId,
        p_code_hash: codeHash,
        p_browser_secret_hash: browserSecretHash,
        p_request_fingerprint: fingerprint,
        p_return_to: '/events/test?view=party',
      },
    )
    expect(createError).toBeNull()
    expect(created).toMatchObject({ allowed: true, expires_in_seconds: 300 })
    const attemptId = (created as { attempt_id: string }).attempt_id

    const { data: wrongTenantApproval } = await client.rpc(
      'approve_discord_browser_auth_attempt',
      {
        p_guild_id: crypto.randomUUID(),
        p_code_hash: codeHash,
        p_discord_id: '123456789012345678',
      },
    )
    expect(wrongTenantApproval).toBe(false)

    const { data: approved, error: approvalError } = await client.rpc(
      'approve_discord_browser_auth_attempt',
      {
        p_guild_id: tenant.guildId,
        p_code_hash: codeHash,
        p_discord_id: '123456789012345678',
      },
    )
    expect(approvalError).toBeNull()
    expect(approved).toBe(true)

    const consume = () => client
      .from('discord_browser_auth_attempts')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', attemptId)
      .eq('guild_id', tenant.guildId)
      .eq('browser_secret_hash', browserSecretHash)
      .eq('approved_discord_id', '123456789012345678')
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id')
      .maybeSingle()

    const first = await consume()
    expect(first.error).toBeNull()
    expect(first.data?.id).toBe(attemptId)
    const second = await consume()
    expect(second.error).toBeNull()
    expect(second.data).toBeNull()
  })
})
