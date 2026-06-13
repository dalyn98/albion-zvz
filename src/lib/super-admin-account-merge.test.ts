import { describe, expect, it } from 'vitest'
import {
  executeMemberAccountMerge,
  normalizeMemberAccountMergeInput,
  previewMemberAccountMerge,
} from './super-admin-account-merge'

const GUILD_ID = '11111111-1111-4111-8111-111111111111'
const SOURCE_ID = '111111111111111111'
const TARGET_ID = '222222222222222222'
const ACTOR_ID = '999999999999999999'

function createRpcClient(data: unknown, error: { message: string } | null = null) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  return {
    calls,
    client: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args })
        return { data, error }
      },
    },
  }
}

describe('super-admin account merge helpers', () => {
  it('normalizes and rejects unsafe account merge input', () => {
    expect(
      normalizeMemberAccountMergeInput({
        guildId: ` ${GUILD_ID} `,
        fromDiscordId: SOURCE_ID,
        toDiscordId: TARGET_ID,
      }),
    ).toEqual({
      ok: true,
      input: {
        guildId: GUILD_ID,
        fromDiscordId: SOURCE_ID,
        toDiscordId: TARGET_ID,
        reason: null,
      },
    })

    expect(
      normalizeMemberAccountMergeInput({
        guildId: GUILD_ID,
        fromDiscordId: SOURCE_ID,
        toDiscordId: SOURCE_ID,
      }),
    ).toEqual({ ok: false, error: 'source and target Discord IDs must be different' })

    expect(
      normalizeMemberAccountMergeInput({
        guildId: GUILD_ID,
        fromDiscordId: 'abc',
        toDiscordId: TARGET_ID,
      }),
    ).toEqual({ ok: false, error: 'source Discord ID must be a numeric snowflake' })
  })

  it('calls the preview RPC and maps blockers into canMerge=false', async () => {
    const { client, calls } = createRpcClient({
      canMerge: false,
      blockers: ['slot_event_conflict'],
      warnings: ['target_has_existing_data'],
      counts: { point_ledger: 3 },
      source: { discordId: SOURCE_ID, username: 'old' },
      target: { discordId: TARGET_ID, username: 'new' },
    })

    const result = await previewMemberAccountMerge(client, {
      guildId: GUILD_ID,
      fromDiscordId: SOURCE_ID,
      toDiscordId: TARGET_ID,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.preview.canMerge).toBe(false)
    expect(result.preview.blockers).toEqual(['slot_event_conflict'])
    expect(result.preview.counts.point_ledger).toBe(3)
    expect(calls).toEqual([
      {
        name: 'preview_member_account_merge',
        args: {
          p_guild_id: GUILD_ID,
          p_from_discord_id: SOURCE_ID,
          p_to_discord_id: TARGET_ID,
        },
      },
    ])
  })

  it('requires an explicit confirmation before executing the merge RPC', async () => {
    const { client, calls } = createRpcClient({ canMerge: true })

    const result = await executeMemberAccountMerge(client, {
      guildId: GUILD_ID,
      fromDiscordId: SOURCE_ID,
      toDiscordId: TARGET_ID,
      actorDiscordId: ACTOR_ID,
      reason: 'support ticket #42',
      confirmation: 'merge',
    })

    expect(result).toEqual({ ok: false, error: 'confirmation must be MERGE' })
    expect(calls).toEqual([])
  })

  it('executes the merge RPC with sanitized reason and actor metadata', async () => {
    const { client, calls } = createRpcClient({
      canMerge: true,
      moved: { point_ledger: 3, shop_orders: 1 },
      warnings: [],
      source: { discordId: SOURCE_ID, username: 'old' },
      target: { discordId: TARGET_ID, username: 'new' },
    })

    const result = await executeMemberAccountMerge(client, {
      guildId: GUILD_ID,
      fromDiscordId: SOURCE_ID,
      toDiscordId: TARGET_ID,
      actorDiscordId: ACTOR_ID,
      reason: '  support ticket #42  ',
      confirmation: 'MERGE',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.result.moved).toEqual({ point_ledger: 3, shop_orders: 1 })
    expect(calls).toEqual([
      {
        name: 'merge_member_accounts',
        args: {
          p_guild_id: GUILD_ID,
          p_from_discord_id: SOURCE_ID,
          p_to_discord_id: TARGET_ID,
          p_actor_discord_id: ACTOR_ID,
          p_reason: 'support ticket #42',
        },
      },
    ])
  })
})
