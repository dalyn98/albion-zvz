import { describe, it, expect, vi, beforeEach } from 'vitest'

type DiscordMember = { user: { id: string } | null; roles: string[] }
type AvatarRow = { discord_id: string; withdrawn_at: string | null }

const settings: Record<string, string> = {}
const getAppSettingMock = vi.fn<(k: string, f: string, g: string) => Promise<string>>(
  async (k, f) => settings[k] ?? f,
)
const tenantConfig = {
  id: 'tenant-1',
  discordGuildId: '99',
  slug: 'demo',
  name: 'Demo',
  memberRoleIds: [] as string[],
  adminRoleIds: [] as string[],
  eventChannelId: null,
  botInstalled: true,
}
const getTenantDiscordConfigMock = vi.fn<() => Promise<typeof tenantConfig | null>>(
  async () => tenantConfig,
)
const listGuildMembersBulkMock = vi.fn<() => Promise<DiscordMember[]>>(async () => [])
const revalidatePathMock = vi.fn<(p: string) => void>()

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: (k: string, f: string, g: string) => getAppSettingMock(k, f, g),
}))
vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: () => getTenantDiscordConfigMock(),
}))
vi.mock('@/lib/discord', () => ({
  listGuildMembersBulk: () => listGuildMembersBulkMock(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePathMock(p),
}))

let avatarRows: AvatarRow[] = []
let avatarsError: { message: string } | null = null
const updates: Array<{ withdrawn_at: string | null; discord_ids: string[] }> = []
const upserts: Array<{ key: string; value: string }> = []

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table === 'guild_avatars') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: avatarRows, error: avatarsError }),
          }),
          update: (patch: { withdrawn_at: string | null }) => ({
            eq: () => ({
              in: (_col: string, ids: string[]) => {
                updates.push({ withdrawn_at: patch.withdrawn_at, discord_ids: ids })
                return Promise.resolve({ error: null })
              },
            }),
          }),
        }
      }
      if (table === 'app_settings') {
        return {
          upsert: (row: { key: string; value: string }) => {
            upserts.push({ key: row.key, value: row.value })
            return Promise.resolve({ error: null })
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }),
}))

import { runMemberSync, MIN_SYNC_INTERVAL_MS } from './member-sync'

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k]
  getAppSettingMock.mockClear()
  tenantConfig.memberRoleIds = []
  getTenantDiscordConfigMock.mockClear().mockResolvedValue(tenantConfig)
  listGuildMembersBulkMock.mockReset().mockResolvedValue([])
  revalidatePathMock.mockReset()
  avatarRows = []
  avatarsError = null
  updates.length = 0
  upserts.length = 0
})

describe('runMemberSync throttle', () => {
  it('returns throttled if last sync was within MIN_SYNC_INTERVAL_MS', async () => {
    settings.last_member_sync_at = new Date(Date.now() - 1_000).toISOString()
    const r = await runMemberSync('tenant-1')
    expect(r.kind).toBe('throttled')
  })

  it('proceeds when last sync was longer ago than MIN_SYNC_INTERVAL_MS', async () => {
    settings.last_member_sync_at = new Date(Date.now() - MIN_SYNC_INTERVAL_MS - 1_000).toISOString()
    const r = await runMemberSync('tenant-1')
    expect(r.kind).toBe('ok')
  })

  it('skipThrottle bypasses interval even when recently synced', async () => {
    settings.last_member_sync_at = new Date(Date.now() - 1_000).toISOString()
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    expect(r.kind).toBe('ok')
  })

  it('treats invalid lastSyncAt as no throttle', async () => {
    settings.last_member_sync_at = 'not-a-date'
    const r = await runMemberSync('tenant-1')
    expect(r.kind).toBe('ok')
  })
})

describe('runMemberSync config errors', () => {
  it('returns error if tenant config missing', async () => {
    getTenantDiscordConfigMock.mockResolvedValueOnce(null)
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/Tenant not found/)
  })

  it('returns error if guild_avatars query fails', async () => {
    avatarsError = { message: 'pg failure' }
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/pg failure/)
  })

  it('returns error if Discord bulk fetch throws', async () => {
    listGuildMembersBulkMock.mockRejectedValueOnce(new Error('discord 5xx'))
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/discord 5xx/)
  })
})

describe('runMemberSync rolesSource selection', () => {
  it('uses "explicit" when active_member_role_ids is set', async () => {
    settings.active_member_role_ids = JSON.stringify(['role-a'])
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.result.rolesSource).toBe('explicit')
  })

  it('falls back to tenant.member_role_ids ("env_fallback") when no explicit roles', async () => {
    tenantConfig.memberRoleIds = ['role-tenant']
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.result.rolesSource).toBe('env_fallback')
      expect(r.result.activeRoleIdsCount).toBe(1)
    }
  })

  it('uses "server_only" when neither explicit nor tenant roles are set', async () => {
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') expect(r.result.rolesSource).toBe('server_only')
  })
})

describe('runMemberSync withdraw / rejoin transitions', () => {
  it('marks members no longer in the server as withdrawn', async () => {
    settings.active_member_role_ids = JSON.stringify(['role-a'])
    avatarRows = [
      { discord_id: 'a', withdrawn_at: null },
      { discord_id: 'b', withdrawn_at: null },
    ]
    listGuildMembersBulkMock.mockResolvedValueOnce([
      { user: { id: 'a' }, roles: ['role-a'] },
      // 'b' missing from Discord → withdraw
    ])
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.result.withdrawn).toBe(1)
      expect(r.result.rejoined).toBe(0)
    }
    expect(updates).toContainEqual({
      withdrawn_at: expect.any(String),
      discord_ids: ['b'],
    })
  })

  it('marks active-role-lacking members as withdrawn even when still in server', async () => {
    settings.active_member_role_ids = JSON.stringify(['role-active'])
    avatarRows = [{ discord_id: 'a', withdrawn_at: null }]
    listGuildMembersBulkMock.mockResolvedValueOnce([
      { user: { id: 'a' }, roles: ['role-other'] },
    ])
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    if (r.kind === 'ok') expect(r.result.withdrawn).toBe(1)
  })

  it('rejoins previously-withdrawn members who came back with an active role', async () => {
    settings.active_member_role_ids = JSON.stringify(['role-a'])
    avatarRows = [{ discord_id: 'a', withdrawn_at: '2025-01-01T00:00:00Z' }]
    listGuildMembersBulkMock.mockResolvedValueOnce([
      { user: { id: 'a' }, roles: ['role-a'] },
    ])
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    if (r.kind === 'ok') {
      expect(r.result.rejoined).toBe(1)
      expect(r.result.withdrawn).toBe(0)
    }
    expect(updates).toContainEqual({ withdrawn_at: null, discord_ids: ['a'] })
  })

  it('treats every server member as active when activeRoleIds is empty', async () => {
    avatarRows = [{ discord_id: 'a', withdrawn_at: '2025-01-01T00:00:00Z' }]
    listGuildMembersBulkMock.mockResolvedValueOnce([
      { user: { id: 'a' }, roles: [] },
    ])
    const r = await runMemberSync('tenant-1', { skipThrottle: true })
    if (r.kind === 'ok') {
      expect(r.result.rolesSource).toBe('server_only')
      expect(r.result.rejoined).toBe(1)
    }
  })

  it('upserts last_member_sync_at after a successful sync', async () => {
    await runMemberSync('tenant-1', { skipThrottle: true })
    expect(upserts.some((u) => u.key === 'last_member_sync_at')).toBe(true)
  })

  it('skips revalidatePath when nothing changed', async () => {
    avatarRows = []
    await runMemberSync('tenant-1', { skipThrottle: true })
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('revalidates affected paths when transitions occur', async () => {
    avatarRows = [{ discord_id: 'a', withdrawn_at: null }]
    listGuildMembersBulkMock.mockResolvedValueOnce([])
    await runMemberSync('tenant-1', { skipThrottle: true })
    const paths = revalidatePathMock.mock.calls.map((c) => c[0])
    expect(paths).toContain('/members')
    expect(paths).toContain('/admin/dashboard/stats')
  })

  it('passes guildId to all reads/writes (tenant isolation)', async () => {
    await runMemberSync('tenant-XYZ', { skipThrottle: true })
    const guildIdArgs = getAppSettingMock.mock.calls.map((c) => c[2])
    expect(new Set(guildIdArgs)).toContain('tenant-XYZ')
  })
})
