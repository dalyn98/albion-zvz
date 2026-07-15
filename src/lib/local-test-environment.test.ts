import { describe, expect, it } from 'vitest'

async function loadSetupModule() {
  return import(
    /* @vite-ignore */ new URL('../../scripts/setup-local-test-env.mjs', import.meta.url).href
  )
}

const LOCAL_STATUS = {
  API_URL: 'http://127.0.0.1:54321',
  ANON_KEY: 'legacy-anon-key',
  PUBLISHABLE_KEY: 'sb_publishable_local',
  SERVICE_ROLE_KEY: 'local-service-role',
}

describe('local test environment setup', () => {
  it('maps every application and integration credential to local Supabase', async () => {
    const { buildLocalEnvUpdates } = await loadSetupModule()
    const updates = buildLocalEnvUpdates(
      LOCAL_STATUS,
      {
        COOKIE_SECRET: 'existing-cookie-secret-that-is-long-enough',
        TEST_AUTH_SECRET: 'existing-test-auth-secret',
        CRON_SECRET: 'existing-cron-secret-that-is-long-enough',
      },
      () => 'generated-secret-that-is-long-enough',
    )

    expect(updates).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_STATUS.API_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_STATUS.PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: LOCAL_STATUS.SERVICE_ROLE_KEY,
      TEST_SUPABASE_URL: LOCAL_STATUS.API_URL,
      TEST_SUPABASE_SERVICE_KEY: LOCAL_STATUS.SERVICE_ROLE_KEY,
      ALLOW_REMOTE_TEST_SUPABASE: '0',
      APP_URL: 'http://localhost:3000',
      COOKIE_SECURE: 'false',
      TENANT_ROOT_DOMAIN: 'localhost',
      NEXT_PUBLIC_TENANT_BASE_URL: '',
      ALLOWED_ORIGINS: '',
      ENABLE_TEST_AUTH: 'true',
      COOKIE_SECRET: 'existing-cookie-secret-that-is-long-enough',
      TEST_AUTH_SECRET: 'existing-test-auth-secret',
      CRON_SECRET: 'existing-cron-secret-that-is-long-enough',
    })
  })

  it('refuses remote Supabase status output', async () => {
    const { buildLocalEnvUpdates } = await loadSetupModule()

    expect(() =>
      buildLocalEnvUpdates(
        { ...LOCAL_STATUS, API_URL: 'https://production.supabase.co' },
        {},
        () => 'generated-secret-that-is-long-enough',
      ),
    ).toThrow('local Supabase')
  })

  it('replaces managed duplicates while preserving unrelated and Discord settings', async () => {
    const { renderLocalEnv } = await loadSetupModule()
    const source = [
      '# user settings',
      'SUPABASE_ACCESS_TOKEN=keep-me',
      'DISCORD_CLIENT_ID=keep-discord-if-present',
      'APP_URL=https://stale.example',
      'APP_URL=https://duplicate.example',
      '',
    ].join('\n')
    const rendered = renderLocalEnv(source, {
      APP_URL: 'http://localhost:3000',
      COOKIE_SECURE: 'false',
    })

    expect(rendered).toContain('SUPABASE_ACCESS_TOKEN=keep-me')
    expect(rendered).toContain('DISCORD_CLIENT_ID=keep-discord-if-present')
    expect(rendered.match(/^APP_URL=/gm)).toHaveLength(1)
    expect(rendered).toContain('APP_URL=http://localhost:3000')
    expect(rendered).not.toContain('stale.example')
  })

  it('builds a trusted local Albion identity for the Test Auth member', async () => {
    const { buildLocalMemberSeed } = await loadSetupModule()
    const seed = buildLocalMemberSeed('tenant-id', '2026-07-16T00:00:00.000Z')

    expect(seed.avatar).toMatchObject({
      guild_id: 'tenant-id',
      discord_id: 'test-auth:member',
      albion_server: 'west',
      albion_nickname: 'LocalTestMember',
    })
    expect(seed.profile).toMatchObject({
      discord_id: 'test-auth:member',
      claim_status: 'claimed',
      is_primary: true,
    })
    expect(seed.tenantLink).toMatchObject({
      guild_id: 'tenant-id',
      discord_id: 'test-auth:member',
      relation: 'home_guild',
      trust_status: 'trusted',
    })
  })
})

describe('local Test Auth storage states', () => {
  it('defines separate member and admin sessions for the seeded tenant', async () => {
    const { buildAuthStateDefinitions } = await import(
      /* @vite-ignore */ new URL('../../scripts/create-test-auth-states.mjs', import.meta.url).href
    )

    expect(buildAuthStateDefinitions('menhera')).toEqual([
      expect.objectContaining({ role: 'member', tenantSlug: 'menhera' }),
      expect.objectContaining({ role: 'admin', tenantSlug: 'menhera' }),
    ])
  })
})
