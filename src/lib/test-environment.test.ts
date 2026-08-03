import { describe, expect, it } from 'vitest'

async function loadModule() {
  return import(/* @vite-ignore */ new URL('../../scripts/test-environment.mjs', import.meta.url).href)
}

describe('strict integration test environment', () => {
  it('requires the exact Node major and all local Supabase credentials', async () => {
    const { validateIntegrationEnv, validateNodeVersion } = await loadModule()
    expect(() => validateNodeVersion('v24.14.0', '24')).not.toThrow()
    expect(() => validateNodeVersion('v25.1.0', '24')).toThrow('Node 24.x is required')
    expect(() => validateIntegrationEnv({
      TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
      TEST_SUPABASE_SERVICE_KEY: 'service',
    })).toThrow('TEST_SUPABASE_ANON_KEY')
    expect(() => validateIntegrationEnv({
      TEST_SUPABASE_URL: 'http://127.0.0.1:54321',
      TEST_SUPABASE_ANON_KEY: 'anon',
      TEST_SUPABASE_SERVICE_KEY: 'service',
      ALLOW_REMOTE_TEST_SUPABASE: '0',
    })).not.toThrow()
  })

  it('fails before tests when repository and database migrations drift', async () => {
    const { parseMigrationList, validateMigrationParity } = await loadModule()
    const current = parseMigrationList(JSON.stringify({ migrations: [
      { local: '000', remote: '000' },
      { local: '001', remote: '001' },
    ] }))
    expect(() => validateMigrationParity(current)).not.toThrow()

    const stale = parseMigrationList(JSON.stringify({ migrations: [
      { local: '000', remote: '000' },
      { local: '001', remote: '' },
    ] }))
    expect(() => validateMigrationParity(stale)).toThrow('not applied locally: 001')
  })
})
