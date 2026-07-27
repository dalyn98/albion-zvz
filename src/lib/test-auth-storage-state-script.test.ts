import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  it('isolates integration credentials and restarts Chromium between auth roles in CI', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github/workflows/test.yml'),
      'utf8',
    )

    expect(workflow).not.toContain('echo "NEXT_PUBLIC_SUPABASE_URL=$API_URL" >> "$GITHUB_ENV"')
    expect(workflow).not.toContain('--groups member,admin')
    expect(workflow).toContain('--groups member')
    expect(workflow).toContain('--groups admin')
    expect(workflow).not.toContain('npm run dev > /tmp/albion-next')
    expect(workflow).toContain('npm run build > /tmp/albion-next-runtime.log')
    expect(workflow).toContain('npm run start >> /tmp/albion-next-runtime.log')
  })
})
