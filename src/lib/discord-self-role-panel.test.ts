import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addDiscordGuildMemberRole: vi.fn(),
  removeDiscordGuildMemberRole: vi.fn(),
  getAppSetting: vi.fn(),
  from: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/discord', () => ({
  addDiscordGuildMemberRole: mocks.addDiscordGuildMemberRole,
  removeDiscordGuildMemberRole: mocks.removeDiscordGuildMemberRole,
}))
vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))
vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
}))
vi.mock('@/lib/log', () => ({
  log: { error: mocks.logError },
}))

import {
  buildDiscordSelfRolePanelCustomId,
  buildDiscordSelfRolePanelPayload,
  handleDiscordSelfRolePanelInteraction,
  isDiscordSelfRolePanelCustomId,
  parseDiscordSelfRolePanelConfig,
  parseDiscordSelfRolePanelCustomId,
} from '@/lib/discord-self-role-panel'
import {
  INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
  MESSAGE_FLAG_EPHEMERAL,
  type DiscordInteractionPayload,
} from '@/lib/discord-interactions'

const DISCORD_GUILD_ID = '1231989392277635102'
const CHANNEL_ID = '1527633498054066196'
const USER_ID = '1529000000000000001'
const ROLE_IDS = [
  '1525586411787387051',
  '1525586931079974962',
  '1525587064496717844',
  '1525587169396396223',
] as const

const rawConfig = JSON.stringify({
  channelId: CHANNEL_ID,
  title: '기본 역할 선택',
  description: '버튼을 눌러 역할을 선택하세요.',
  resetLabel: '초기화',
  roles: [
    { id: ROLE_IDS[0], label: 'DPS_Basic' },
    { id: ROLE_IDS[1], label: 'Tank_Basic' },
    { id: ROLE_IDS[2], label: 'Sup_Basic' },
    { id: ROLE_IDS[3], label: 'Heal_Basic' },
  ],
})

function payload(customId: string, overrides: Partial<DiscordInteractionPayload> = {}): DiscordInteractionPayload {
  return {
    id: 'interaction-1',
    type: 3,
    guild_id: DISCORD_GUILD_ID,
    channel_id: CHANNEL_ID,
    locale: 'ko',
    member: {
      user: { id: USER_ID, username: 'member' },
      roles: [],
    },
    data: { custom_id: customId, component_type: 2 },
    ...overrides,
  }
}

function mockActiveTenant(): void {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'tenant-1' }, error: null })
  const statusEq = vi.fn(() => ({ maybeSingle }))
  const guildEq = vi.fn(() => ({ eq: statusEq }))
  const select = vi.fn(() => ({ eq: guildEq }))
  mocks.from.mockReturnValue({ select })
}

describe('Discord self-role panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockActiveTenant()
    mocks.getAppSetting.mockResolvedValue(rawConfig)
    mocks.addDiscordGuildMemberRole.mockResolvedValue(undefined)
    mocks.removeDiscordGuildMemberRole.mockResolvedValue(undefined)
  })

  it('builds and parses only versioned role-panel custom IDs', () => {
    const addId = buildDiscordSelfRolePanelCustomId({ kind: 'add', roleId: ROLE_IDS[0] })
    const resetId = buildDiscordSelfRolePanelCustomId({ kind: 'reset' })

    expect(addId).toBe(`agm_role:v1:add:${ROLE_IDS[0]}`)
    expect(resetId).toBe('agm_role:v1:reset')
    expect(isDiscordSelfRolePanelCustomId(addId)).toBe(true)
    expect(parseDiscordSelfRolePanelCustomId(addId)).toEqual({ kind: 'add', roleId: ROLE_IDS[0] })
    expect(parseDiscordSelfRolePanelCustomId(resetId)).toEqual({ kind: 'reset' })
    expect(parseDiscordSelfRolePanelCustomId('agm_role:v1:add:not-a-role')).toBeNull()
    expect(parseDiscordSelfRolePanelCustomId(`agm_role:v2:add:${ROLE_IDS[0]}`)).toBeNull()
  })

  it('rejects malformed panel settings and duplicate role IDs', () => {
    expect(parseDiscordSelfRolePanelConfig('not-json')).toBeNull()
    expect(parseDiscordSelfRolePanelConfig(JSON.stringify({
      ...JSON.parse(rawConfig),
      roles: [
        { id: ROLE_IDS[0], label: 'DPS' },
        { id: ROLE_IDS[0], label: 'Duplicate' },
      ],
    }))).toBeNull()
  })

  it('builds four role buttons plus a reset button without mentions', () => {
    const config = parseDiscordSelfRolePanelConfig(rawConfig)
    expect(config).not.toBeNull()

    const message = buildDiscordSelfRolePanelPayload(config!)

    expect(message.allowed_mentions).toEqual({ parse: [] })
    expect(message.embeds?.[0]).toMatchObject({
      title: '기본 역할 선택',
      description: '버튼을 눌러 역할을 선택하세요.',
    })
    expect(message.components).toHaveLength(1)
    expect(message.components?.[0].components).toHaveLength(5)
    expect(message.components?.[0].components).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'DPS_Basic', custom_id: `agm_role:v1:add:${ROLE_IDS[0]}` }),
      expect.objectContaining({ label: '초기화', custom_id: 'agm_role:v1:reset', style: 4 }),
    ]))
  })

  it('grants only a role whitelisted by the tenant panel config', async () => {
    const response = await handleDiscordSelfRolePanelInteraction(
      payload(buildDiscordSelfRolePanelCustomId({ kind: 'add', roleId: ROLE_IDS[0] })),
    )

    expect(mocks.getAppSetting).toHaveBeenCalledWith(
      'discord_self_role_panel_config',
      '',
      'tenant-1',
    )
    expect(mocks.addDiscordGuildMemberRole).toHaveBeenCalledWith({
      discordGuildId: DISCORD_GUILD_ID,
      discordUserId: USER_ID,
      discordRoleId: ROLE_IDS[0],
      auditLogReason: `Self-role panel grant requested by ${USER_ID}`,
    })
    expect(response).toMatchObject({
      type: INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
      data: {
        flags: MESSAGE_FLAG_EPHEMERAL,
        content: '**DPS_Basic** 역할을 부여했습니다.',
      },
    })
  })

  it('rejects a valid-looking role ID that is not in the tenant config', async () => {
    const response = await handleDiscordSelfRolePanelInteraction(
      payload(buildDiscordSelfRolePanelCustomId({
        kind: 'add',
        roleId: '1529999999999999999',
      })),
    )

    expect(mocks.addDiscordGuildMemberRole).not.toHaveBeenCalled()
    expect(response.data?.content).toBe('이 채널에서는 역할 버튼을 사용할 수 없습니다.')
  })

  it('rejects a copied button used outside its configured channel', async () => {
    const response = await handleDiscordSelfRolePanelInteraction(
      payload(
        buildDiscordSelfRolePanelCustomId({ kind: 'add', roleId: ROLE_IDS[0] }),
        { channel_id: '1529999999999999998' },
      ),
    )

    expect(mocks.addDiscordGuildMemberRole).not.toHaveBeenCalled()
    expect(response.data?.content).toBe('이 채널에서는 역할 버튼을 사용할 수 없습니다.')
  })

  it('rejects a matching custom ID from a non-button interaction', async () => {
    const response = await handleDiscordSelfRolePanelInteraction(
      payload(
        buildDiscordSelfRolePanelCustomId({ kind: 'add', roleId: ROLE_IDS[0] }),
        {
          type: 5,
          data: {
            custom_id: buildDiscordSelfRolePanelCustomId({ kind: 'add', roleId: ROLE_IDS[0] }),
          },
        },
      ),
    )

    expect(mocks.addDiscordGuildMemberRole).not.toHaveBeenCalled()
    expect(response.data?.content).toBe('지원하지 않는 역할 버튼입니다.')
  })

  it('reset removes exactly the roles configured for this panel', async () => {
    const response = await handleDiscordSelfRolePanelInteraction(
      payload(buildDiscordSelfRolePanelCustomId({ kind: 'reset' })),
    )

    expect(mocks.removeDiscordGuildMemberRole).toHaveBeenCalledTimes(4)
    expect(mocks.removeDiscordGuildMemberRole.mock.calls.map(([input]) => input.discordRoleId))
      .toEqual([...ROLE_IDS])
    expect(response.data?.content).toBe('이 패널에서 선택한 역할을 모두 초기화했습니다.')
  })

  it('returns a localized failure without leaking Discord API details', async () => {
    mocks.addDiscordGuildMemberRole.mockRejectedValueOnce(new Error('Discord 403 raw body'))

    const response = await handleDiscordSelfRolePanelInteraction(
      payload(buildDiscordSelfRolePanelCustomId({ kind: 'add', roleId: ROLE_IDS[0] })),
    )

    expect(response.data?.content).toBe('역할 변경에 실패했습니다. 봇 권한을 확인해 주세요.')
    expect(response.data?.content).not.toContain('403')
    expect(mocks.logError).toHaveBeenCalledOnce()
  })
})
