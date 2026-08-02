import { describe, expect, it } from 'vitest'
import {
  buildPublicGuildDirectoryEntries,
  filterPublicGuildDirectoryEntries,
  type PublicGuildDirectoryFeatureRow,
  type PublicGuildDirectorySettingRow,
  type PublicGuildDirectoryTenantRow,
} from './public-guild-directory'

const tenants: PublicGuildDirectoryTenantRow[] = [
  { id: 'guild-open', slug: 'open-guild', name: 'Discord Open', status: 'active' },
  { id: 'guild-selective', slug: 'selective-guild', name: 'Selective', status: 'active' },
  { id: 'guild-hidden', slug: 'hidden-guild', name: 'Hidden', status: 'active' },
  { id: 'guild-paused', slug: 'paused-guild', name: 'Paused', status: 'paused' },
]

const features: PublicGuildDirectoryFeatureRow[] = tenants.map((tenant) => ({
  guild_id: tenant.id,
  feature_key: 'public_guild_profile',
  state: 'enabled',
}))

const settings: PublicGuildDirectorySettingRow[] = [
  { guild_id: 'guild-open', key: 'guild_profile_enabled', value: 'true' },
  { guild_id: 'guild-open', key: 'guild_profile_recruitment_status', value: 'open' },
  { guild_id: 'guild-open', key: 'albion_home_guild_name', value: 'Albion Open' },
  { guild_id: 'guild-open', key: 'albion_server', value: 'east' },
  { guild_id: 'guild-open', key: 'guild_profile_languages', value: 'ko,en,ko,invalid' },
  { guild_id: 'guild-open', key: 'guild_profile_recruiting_roles', value: 'Tank, Healer' },
  { guild_id: 'guild-selective', key: 'guild_profile_enabled', value: 'true' },
  { guild_id: 'guild-selective', key: 'guild_profile_recruitment_status', value: 'selective' },
  { guild_id: 'guild-selective', key: 'guild_profile_server', value: 'west' },
  { guild_id: 'guild-hidden', key: 'guild_profile_enabled', value: 'true' },
  { guild_id: 'guild-hidden', key: 'guild_profile_recruitment_status', value: 'open' },
  { guild_id: 'guild-paused', key: 'guild_profile_enabled', value: 'true' },
  { guild_id: 'guild-paused', key: 'guild_profile_recruitment_status', value: 'open' },
]

describe('public guild directory', () => {
  it('publishes only active, enabled, recruiting, undisputed guild profiles', () => {
    const entries = buildPublicGuildDirectoryEntries({
      tenants,
      settings,
      features,
      disputes: [{ incumbent_guild_id: 'guild-hidden', status: 'under_review' }],
    })

    expect(entries).toEqual([
      expect.objectContaining({
        slug: 'open-guild',
        name: 'Albion Open',
        server: 'east',
        recruitmentStatus: 'open',
        languages: ['ko', 'en'],
      }),
      expect.objectContaining({
        slug: 'selective-guild',
        server: 'west',
        recruitmentStatus: 'selective',
      }),
    ])
    expect(JSON.stringify(entries)).not.toContain('guild-open')
  })

  it('fails closed when the feature projection is draining or the legacy toggle is off', () => {
    const entries = buildPublicGuildDirectoryEntries({
      tenants: tenants.slice(0, 2),
      settings: settings.map((row) => (
        row.guild_id === 'guild-open' && row.key === 'guild_profile_enabled'
          ? { ...row, value: 'false' }
          : row
      )),
      features: features.map((row) => (
        row.guild_id === 'guild-selective' ? { ...row, state: 'draining' } : row
      )),
      disputes: [],
    })

    expect(entries).toEqual([])
  })

  it('filters only the public presentation fields', () => {
    const entries = buildPublicGuildDirectoryEntries({
      tenants,
      settings,
      features,
      disputes: [],
    })

    expect(filterPublicGuildDirectoryEntries(entries, {
      query: 'healer',
      server: 'east',
      recruitmentStatus: 'open',
      language: 'en',
    }).map((entry) => entry.slug)).toEqual(['open-guild'])
  })
})
