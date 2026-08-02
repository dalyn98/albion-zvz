#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'
const DEFAULT_OUTPUT_DIR = resolve('artifacts', 'test-auth')
const DEFAULT_TENANT_SLUG = 'menhera'
const STORAGE_STATE_ROLES = {
  member: 'member',
  admin: 'admin',
}

function getArgValue(argv, name) {
  const equalPrefix = `${name}=`
  const equalMatch = argv.find((arg) => arg.startsWith(equalPrefix))
  if (equalMatch) return equalMatch.slice(equalPrefix.length)

  const index = argv.indexOf(name)
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  return {
    baseUrl: String(
      getArgValue(argv, '--base-url') || env.TEST_AUTH_BASE_URL || DEFAULT_BASE_URL,
    ).replace(/\/+$/, ''),
    outputDir: resolve(
      getArgValue(argv, '--output-dir') ||
        env.TEST_AUTH_STORAGE_STATE_DIR ||
        DEFAULT_OUTPUT_DIR,
    ),
    tenantSlug:
      getArgValue(argv, '--tenant-slug') ||
      env.TEST_AUTH_TENANT_SLUG ||
      DEFAULT_TENANT_SLUG,
    secret: env.TEST_AUTH_SECRET || '',
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL || '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
  }
}

export function isLocalSupabaseUrl(value) {
  try {
    return ['127.0.0.1', 'localhost', '::1'].includes(new URL(value).hostname)
  } catch {
    return false
  }
}

async function provisionLocalTestMember(config) {
  if (!isLocalSupabaseUrl(config.supabaseUrl)) {
    throw new Error('Authenticated CI smoke may provision members only in local Supabase')
  }
  if (!config.serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for authenticated CI smoke')
  }

  const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .select('id')
    .eq('slug', config.tenantSlug)
    .maybeSingle()
  if (tenantError || !tenant) {
    throw new Error(`local test tenant unavailable: ${tenantError?.message || config.tenantSlug}`)
  }

  // The browser smoke suite exercises the experimental tactics routes. Keep
  // production defaults fail-closed, but opt the disposable local tenant in so
  // those routes are rendered instead of intentionally redirecting home.
  const { error: settingError } = await db.from('app_settings').upsert(
    {
      guild_id: tenant.id,
      key: 'tactics_experimental_enabled',
      value: 'true',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'guild_id,key' },
  )
  if (settingError) {
    throw new Error(`local test tactics setting failed: ${settingError.message}`)
  }

  const { error } = await db.from('guild_avatars').upsert(
    {
      guild_id: tenant.id,
      discord_id: 'test-auth:member',
      username: 'Test member',
      avatar: null,
      albion_server: 'west',
      albion_player_id: 'test-auth-albion-member',
      albion_nickname: 'Test Member',
      albion_guild_id: 'test-auth-guild',
      albion_verified_at: new Date().toISOString(),
      withdrawn_at: null,
    },
    { onConflict: 'guild_id,discord_id' },
  )
  if (error) throw new Error(`local test member provisioning failed: ${error.message}`)
}

async function issueStorageState(browser, config, storageStateRole, sessionRole) {
  const context = await browser.newContext()
  try {
    const response = await context.request.post(
      new URL('/api/test/auth/session', config.baseUrl).toString(),
      {
        headers: {
          'content-type': 'application/json',
          'x-test-auth-secret': config.secret,
        },
        data: {
          role: sessionRole,
          tenantSlug: config.tenantSlug,
          locale: 'ko',
          returnTo: storageStateRole === 'admin' ? '/admin/dashboard' : '/me',
        },
      },
    )
    if (!response.ok()) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `test auth session failed for ${storageStateRole}: ${response.status()} ${body.slice(0, 200)}`,
      )
    }

    const outputPath = resolve(config.outputDir, `${storageStateRole}.json`)
    await context.storageState({ path: outputPath })
    return outputPath
  } finally {
    await context.close()
  }
}

export async function createTestAuthStorageStates(config) {
  if (config.secret.length < 16) {
    throw new Error('TEST_AUTH_SECRET must contain at least 16 characters')
  }

  await provisionLocalTestMember(config)
  await mkdir(config.outputDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const paths = {}
    for (const [storageStateRole, sessionRole] of Object.entries(STORAGE_STATE_ROLES)) {
      paths[storageStateRole] = await issueStorageState(
        browser,
        config,
        storageStateRole,
        sessionRole,
      )
    }
    return paths
  } finally {
    await browser.close()
  }
}

async function main() {
  const paths = await createTestAuthStorageStates(parseArgs())
  process.stdout.write(`${paths.member}\n${paths.admin}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
