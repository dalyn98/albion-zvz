import { describe, expect, it } from 'vitest'

async function loadScript() {
  return import(
    /* @vite-ignore */ new URL(
      '../../scripts/create-test-auth-storage-state.mjs',
      import.meta.url,
    ).href
  )
}

describe('test auth storage-state script', () => {
  it('reads the secret only from the environment and resolves safe defaults', async () => {
    const { parseArgs } = await loadScript()
    const config = parseArgs(
      ['--base-url=http://127.0.0.1:3100', '--tenant-slug=test-guild'],
      {
        TEST_AUTH_SECRET: '1234567890123456',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        SUPABASE_SERVICE_ROLE_KEY: 'local-service-role',
      },
    )

    expect(config).toMatchObject({
      baseUrl: 'http://127.0.0.1:3100',
      tenantSlug: 'test-guild',
      secret: '1234567890123456',
      supabaseUrl: 'http://127.0.0.1:54321',
      serviceRoleKey: 'local-service-role',
    })
    expect(config.outputDir).toMatch(/artifacts[\\/]test-auth$/)
  })

  it('refuses to provision a member in remote Supabase', async () => {
    const { isLocalSupabaseUrl } = await loadScript()

    expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
    expect(isLocalSupabaseUrl('http://localhost:54321')).toBe(true)
    expect(isLocalSupabaseUrl('https://project.supabase.co')).toBe(false)
    expect(isLocalSupabaseUrl('not-a-url')).toBe(false)
  })
})
