import { describe, expect, it } from 'vitest'
import {
  GUILD_RECOVERY_KIND,
  GUILD_RECOVERY_SCHEMA_VERSION,
  GUILD_TEMPLATE_PACKAGE_KIND,
  RECOVERY_STATE_KEYS,
  exportGuildRecovery,
  exportGuildTemplatePackage,
  parseGuildRecoveryManifest,
  parseGuildTemplatePackage,
  type GuildRecoveryState,
} from './guild-backup'

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111'

function emptyState(): GuildRecoveryState {
  return Object.fromEntries(
    RECOVERY_STATE_KEYS.map((key) => [key, []]),
  ) as unknown as GuildRecoveryState
}

function recoveryDb(state: GuildRecoveryState = emptyState()) {
  return {
    rpc: async (name: string) => {
      if (name === 'export_guild_recovery_state') {
        return {
          data: {
            sourceWorkspaceId: WORKSPACE_ID,
            sourceAlbionGuildId: 'albion-guild-immutable-id',
            sourceGuildName: 'Menhera',
            state,
          },
          error: null,
        }
      }
      expect(name).toBe('register_guild_recovery_manifest')
      return { data: null, error: null }
    },
  }
}

function templateDb() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data:
              table === 'event_templates'
                ? [{ name: 'Main CTA', data: { parties: [] } }]
                : [{ name: 'Tank', category: '전투', data: { roleName: 'Tank' } }],
            error: null,
          }),
        }),
      }),
    }),
  }
}

describe('guild operational recovery manifest', () => {
  it('exports the versioned same-guild manifest with only explicit recovery domains', async () => {
    const manifest = await exportGuildRecovery(recoveryDb() as never, WORKSPACE_ID)

    expect(manifest.kind).toBe(GUILD_RECOVERY_KIND)
    expect(manifest.schemaVersion).toBe(GUILD_RECOVERY_SCHEMA_VERSION)
    expect(manifest.source).toEqual({
      workspaceId: WORKSPACE_ID,
      albionGuildId: 'albion-guild-immutable-id',
      guildName: 'Menhera',
    })
    expect(Object.keys(manifest.state).sort()).toEqual([...RECOVERY_STATE_KEYS].sort())
    expect(manifest).not.toHaveProperty('settings')
    expect(manifest).not.toHaveProperty('permissions')
    expect(manifest).not.toHaveProperty('templates')
    expect(manifest.integrity).toEqual({
      algorithm: 'SHA-256',
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    })

    await expect(parseGuildRecoveryManifest(manifest)).resolves.toEqual({
      manifest,
    })
  })

  it('rejects a valid-looking row when content changed after signing', async () => {
    const state = emptyState()
    state.memberRefs = [{
      discordId: 'member-1',
      username: 'Member',
      avatar: null,
      withdrawnAt: null,
    }]
    state.pointBalances = [{ discordId: 'member-1', balance: '7' }]
    const manifest = await exportGuildRecovery(recoveryDb(state) as never, WORKSPACE_ID)
    const tampered = structuredClone(manifest)
    tampered.state.pointBalances[0].balance = '8'

    await expect(parseGuildRecoveryManifest(tampered)).resolves.toEqual({
      error: 'invalidIntegrity',
    })
  })

  it('rejects the entire file instead of silently dropping malformed rows', async () => {
    const state = emptyState()
    state.exchangeRequests = [{
      id: '22222222-2222-4222-8222-222222222222',
      status: 'pending',
      discord_id: 'member-1',
      guild_id: WORKSPACE_ID,
    }]
    state.memberRefs = [{
      discordId: 'member-1',
      username: 'Member',
      avatar: null,
      withdrawnAt: null,
    }]
    const manifest = await exportGuildRecovery(recoveryDb(state) as never, WORKSPACE_ID)

    await expect(parseGuildRecoveryManifest(manifest)).resolves.toEqual({
      error: 'invalidState',
    })
  })

  it('rejects extra state domains such as settings or reusable templates', async () => {
    const manifest = await exportGuildRecovery(recoveryDb() as never, WORKSPACE_ID)
    const withSettings = structuredClone(manifest) as unknown as Record<string, unknown>
    ;(withSettings.state as Record<string, unknown>).settings = []

    await expect(parseGuildRecoveryManifest(withSettings)).resolves.toEqual({
      error: 'invalidState',
    })
  })
})

describe('guild template package', () => {
  it('is a distinct finance-free event and slot package', async () => {
    const templatePackage = await exportGuildTemplatePackage(
      templateDb() as never,
      WORKSPACE_ID,
      'Menhera',
    )

    expect(templatePackage.kind).toBe(GUILD_TEMPLATE_PACKAGE_KIND)
    expect(Object.keys(templatePackage.templates).sort()).toEqual(['events', 'slots'])
    expect(templatePackage).not.toHaveProperty('points')
    expect(templatePackage).not.toHaveProperty('members')
    expect(templatePackage).not.toHaveProperty('inventory')
    await expect(parseGuildTemplatePackage(templatePackage)).resolves.toEqual({
      package: templatePackage,
    })
  })

  it('rejects financial fields instead of importing them with templates', async () => {
    const templatePackage = await exportGuildTemplatePackage(
      templateDb() as never,
      WORKSPACE_ID,
      'Menhera',
    )
    const unsafe = {
      ...templatePackage,
      pointBalances: [{ discordId: 'member-1', balance: '999' }],
    }

    await expect(parseGuildTemplatePackage(unsafe)).resolves.toEqual({
      error: 'invalidFile',
    })
  })

  it('rejects member assignment fields nested inside template data', async () => {
    const templatePackage = await exportGuildTemplatePackage(
      templateDb() as never,
      WORKSPACE_ID,
      'Menhera',
    )
    const unsafe = structuredClone(templatePackage)
    ;(unsafe.templates.events[0].data.parties as unknown[]).push({
      party_number: 1,
      slots: [{
        slot_number: 1,
        assigned_discord_id: 'member-1',
        assigned_username: 'Member',
      }],
    })

    await expect(parseGuildTemplatePackage(unsafe)).resolves.toEqual({
      error: 'invalidState',
    })
  })
})
