import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip
const PRIVATE_SECTION_KEYS = [
  'guild_profile_show_admin_team',
  'guild_profile_show_leaderboard',
  'guild_profile_show_regear_stats',
] as const

describeIntegration('public guild profile safe defaults (mig 297)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    ;[tenantA, tenantB] = await Promise.all([
      createTestTenant('public-profile-default-a'),
      createTestTenant('public-profile-default-b'),
    ])
  })

  afterEach(async () => {
    await Promise.all([tenantA?.cleanup(), tenantB?.cleanup()])
  })

  it('backfills the seeded tenant private-section settings without enabling them', async () => {
    const client = getTestServiceClient()
    const { data: seededTenant, error: tenantError } = await client
      .from('tenants')
      .select('id')
      .eq('slug', 'menhera')
      .maybeSingle()
    expect(tenantError).toBeNull()
    expect(seededTenant?.id).toBeTruthy()

    const { data, error } = await client
      .from('app_settings')
      .select('key, value')
      .eq('guild_id', seededTenant?.id as string)
      .in('key', [...PRIVATE_SECTION_KEYS])
      .order('key', { ascending: true })
    expect(error).toBeNull()
    expect(data).toHaveLength(PRIVATE_SECTION_KEYS.length)
    expect(data?.every((row) => row.value === 'false')).toBe(true)
  })

  it('keeps an explicit sensitive-section opt-in isolated to one tenant', async () => {
    const client = getTestServiceClient()
    const { error } = await client.from('app_settings').upsert([
      {
        guild_id: tenantA.guildId,
        key: 'guild_profile_show_admin_team',
        value: 'true',
      },
      {
        guild_id: tenantB.guildId,
        key: 'guild_profile_show_admin_team',
        value: 'false',
      },
    ], { onConflict: 'guild_id,key' })
    expect(error).toBeNull()

    const { data, error: readError } = await client
      .from('app_settings')
      .select('guild_id, value')
      .eq('key', 'guild_profile_show_admin_team')
      .in('guild_id', [tenantA.guildId, tenantB.guildId])
      .order('guild_id', { ascending: true })
    expect(readError).toBeNull()
    expect(
      new Map((data ?? []).map((row) => [row.guild_id, row.value])),
    ).toEqual(
      new Map([
        [tenantA.guildId, 'true'],
        [tenantB.guildId, 'false'],
      ]),
    )
  })
})
