import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('experimental tactic sharing (migration 341)', () => {
  let tenant: TestTenant
  let otherTenant: TestTenant

  beforeEach(async () => {
    ;[tenant, otherTenant] = await Promise.all([
      createTestTenant('tactic-share'),
      createTestTenant('tactic-share-other'),
    ])
  })

  afterEach(async () => {
    await Promise.all([tenant?.cleanup(), otherTenant?.cleanup()])
  })

  async function createBoard(guildId: string): Promise<string> {
    const client = getTestServiceClient()
    const boardId = crypto.randomUUID()
    const { error } = await client.from('tactic_boards').insert({
      id: boardId,
      guild_id: guildId,
      title: 'Private test tactic',
      status: 'draft',
      visibility: 'private',
    })
    expect(error).toBeNull()
    return boardId
  }

  it('issues a finite link atomically only for an enabled tenant', async () => {
    const client = getTestServiceClient()
    const boardId = await createBoard(tenant.guildId)
    const { error: settingError } = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'tactics_experimental_enabled',
      value: 'true',
    })
    expect(settingError).toBeNull()

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: linkId, error } = await client.rpc('issue_tactic_share_link', {
      p_guild_id: tenant.guildId,
      p_board_id: boardId,
      p_token_hash: 'a'.repeat(64),
      p_created_by: 'actor-1',
      p_expires_at: expiresAt,
    })
    expect(error).toBeNull()
    expect(linkId).toEqual(expect.any(String))

    const [{ data: board }, { data: link }] = await Promise.all([
      client
        .from('tactic_boards')
        .select('status, visibility')
        .eq('guild_id', tenant.guildId)
        .eq('id', boardId)
        .single(),
      client
        .from('tactic_share_links')
        .select('expires_at, revoked_at')
        .eq('guild_id', tenant.guildId)
        .eq('id', linkId as string)
        .single(),
    ])
    expect(board).toEqual({ status: 'published', visibility: 'share' })
    expect(Date.parse(link!.expires_at as string)).toBe(Date.parse(expiresAt))
    expect(link?.revoked_at).toBeNull()
  })

  it('keeps disabled tenants fail-closed and rejects excessive expiry', async () => {
    const client = getTestServiceClient()
    const boardId = await createBoard(tenant.guildId)
    const disabled = await client.rpc('issue_tactic_share_link', {
      p_guild_id: tenant.guildId,
      p_board_id: boardId,
      p_token_hash: 'b'.repeat(64),
      p_created_by: 'actor-1',
      p_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    expect(disabled.error?.message).toContain('tactics_experimental_disabled')

    const { error: settingError } = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'tactics_experimental_enabled',
      value: 'true',
    })
    expect(settingError).toBeNull()
    const excessive = await client.rpc('issue_tactic_share_link', {
      p_guild_id: tenant.guildId,
      p_board_id: boardId,
      p_token_hash: 'c'.repeat(64),
      p_created_by: 'actor-1',
      p_expires_at: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
    })
    expect(excessive.error?.message).toContain('tactic_share_expiry_invalid')

    const { count } = await client
      .from('tactic_share_links')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenant.guildId)
      .eq('board_id', boardId)
    expect(count).toBe(0)
  })

  it('revokes idempotently within one tenant and preserves the audit row', async () => {
    const client = getTestServiceClient()
    const boardId = await createBoard(tenant.guildId)
    const { error: settingError } = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'tactics_experimental_enabled',
      value: 'true',
    })
    expect(settingError).toBeNull()
    const { data: linkId, error: issueError } = await client.rpc(
      'issue_tactic_share_link',
      {
        p_guild_id: tenant.guildId,
        p_board_id: boardId,
        p_token_hash: 'd'.repeat(64),
        p_created_by: 'actor-1',
        p_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    )
    expect(issueError).toBeNull()

    const crossTenant = await client.rpc('revoke_tactic_share_link', {
      p_guild_id: otherTenant.guildId,
      p_board_id: boardId,
      p_link_id: linkId as string,
    })
    expect(crossTenant.error).toBeNull()
    expect(crossTenant.data).toBe(false)

    const first = await client.rpc('revoke_tactic_share_link', {
      p_guild_id: tenant.guildId,
      p_board_id: boardId,
      p_link_id: linkId as string,
    })
    expect(first.error).toBeNull()
    expect(first.data).toBe(true)
    const { data: afterFirst } = await client
      .from('tactic_share_links')
      .select('revoked_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', linkId as string)
      .single()

    const second = await client.rpc('revoke_tactic_share_link', {
      p_guild_id: tenant.guildId,
      p_board_id: boardId,
      p_link_id: linkId as string,
    })
    expect(second.error).toBeNull()
    expect(second.data).toBe(true)
    const { data: afterSecond } = await client
      .from('tactic_share_links')
      .select('revoked_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', linkId as string)
      .single()
    expect(afterSecond?.revoked_at).toBe(afterFirst?.revoked_at)
  })

  it('revokes active links permanently when the tenant disables tactics', async () => {
    const client = getTestServiceClient()
    const boardId = await createBoard(tenant.guildId)
    const { error: settingError } = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'tactics_experimental_enabled',
      value: 'true',
    })
    expect(settingError).toBeNull()
    const { data: linkId, error: issueError } = await client.rpc(
      'issue_tactic_share_link',
      {
        p_guild_id: tenant.guildId,
        p_board_id: boardId,
        p_token_hash: '1'.repeat(64),
        p_created_by: 'actor-1',
        p_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    )
    expect(issueError).toBeNull()

    const { error: disableError } = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'tactics_experimental_enabled',
      value: 'false',
    })
    expect(disableError).toBeNull()
    const { data: disabledLink } = await client
      .from('tactic_share_links')
      .select('revoked_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', linkId as string)
      .single()
    expect(disabledLink?.revoked_at).toEqual(expect.any(String))

    const { error: enableError } = await client.from('app_settings').upsert({
      guild_id: tenant.guildId,
      key: 'tactics_experimental_enabled',
      value: 'true',
    })
    expect(enableError).toBeNull()
    const { data: reenabledLink } = await client
      .from('tactic_share_links')
      .select('revoked_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', linkId as string)
      .single()
    expect(reenabledLink?.revoked_at).toBe(disabledLink?.revoked_at)
  })

  it('applies a finite default and rejects expiry at or before creation', async () => {
    const client = getTestServiceClient()
    const boardId = await createBoard(tenant.guildId)
    const { data: defaulted, error } = await client
      .from('tactic_share_links')
      .insert({
        guild_id: tenant.guildId,
        board_id: boardId,
        token_hash: 'e'.repeat(64),
      })
      .select('created_at, expires_at')
      .single()
    expect(error).toBeNull()
    const lifetime =
      Date.parse(defaulted!.expires_at as string) -
      Date.parse(defaulted!.created_at as string)
    expect(lifetime).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000)
    expect(lifetime).toBeLessThan(7.1 * 24 * 60 * 60 * 1000)

    const invalid = await client.from('tactic_share_links').insert({
      guild_id: tenant.guildId,
      board_id: boardId,
      token_hash: 'f'.repeat(64),
      expires_at: '2000-01-01T00:00:00.000Z',
    })
    expect(invalid.error?.message).toContain(
      'tactic_share_links_expiry_after_creation',
    )
  })
})
