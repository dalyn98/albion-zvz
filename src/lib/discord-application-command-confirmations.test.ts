import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
  from: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
}))

import {
  createDiscordApplicationCommandConfirmation,
  isDiscordApplicationCommandConfirmationCustomId,
  parseDiscordApplicationCommandConfirmationCustomId,
} from './discord-application-command-confirmations'
import { loadDiscordCommandSuiteMessages } from './discord-command-suite-messages'
import type {
  DiscordCommandActor,
  DiscordCommandTenant,
} from './discord-command-auth'

const tenant: DiscordCommandTenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'test-guild',
  name: 'Test Guild',
  createdByDiscordId: '123456789012345678',
  adminRoleIds: [],
}

const actor: DiscordCommandActor = {
  guildId: tenant.id,
  discordGuildId: '222222222222222222',
  discordId: '123456789012345678',
  username: 'Member',
  roleIds: [],
  isMember: true,
  isAdmin: false,
  capabilities: 0n,
}

describe('Discord application command confirmation prompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T07:00:00.000Z'))
    mocks.inserted = null
    mocks.from.mockReset()
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe('application_command_confirmations')
      return {
        insert(row: Record<string, unknown>) {
          mocks.inserted = row
          return {
            select() {
              return {
                async single() {
                  return {
                    data: {
                      ...row,
                      confirmed_at: null,
                      cancelled_at: null,
                    },
                    error: null,
                  }
                },
              }
            },
          }
        },
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates an actor-bound five-minute prompt with confirm and cancel buttons', async () => {
    const messages = await loadDiscordCommandSuiteMessages('en')
    const response = await createDiscordApplicationCommandConfirmation({
      tenant,
      actor,
      payload: {
        id: '333333333333333333',
        type: 2,
        guild_id: actor.discordGuildId,
      },
      commandName: 'point.transfer',
      requestPayload: {
        transfers: [{
          discord_id: '444444444444444444',
          amount: 100,
          memo: null,
        }],
      },
      summary: 'Send 100p',
      messages,
    })

    expect(response.type).toBe(4)
    expect(response.data?.flags).toBe(64)
    expect(response.data?.content).toContain('Send 100p')
    expect(mocks.inserted).toMatchObject({
      guild_id: tenant.id,
      discord_guild_id: actor.discordGuildId,
      source_interaction_id: '333333333333333333',
      command_name: 'point.transfer',
      actor_discord_id: actor.discordId,
      expires_at: '2026-07-29T07:05:00.000Z',
    })

    const buttons = response.data?.components?.[0]?.components ?? []
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button.type).toBe(2)
      if (button.type !== 2) continue
      expect(isDiscordApplicationCommandConfirmationCustomId(button.custom_id)).toBe(true)
    }
  })

  it('parses only versioned UUID custom IDs', () => {
    expect(parseDiscordApplicationCommandConfirmationCustomId(
      'agmcmd:v1:confirm:11111111-1111-4111-8111-111111111111',
    )).toEqual({
      action: 'confirm',
      token: '11111111-1111-4111-8111-111111111111',
    })
    expect(isDiscordApplicationCommandConfirmationCustomId(
      'agmcmd:v1:confirm:not-a-token',
    )).toBe(false)
    expect(isDiscordApplicationCommandConfirmationCustomId(
      'other:v1:confirm:11111111-1111-4111-8111-111111111111',
    )).toBe(false)
  })
})
