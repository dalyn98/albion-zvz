#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

const ENV_PATH = resolve('.env.local')
const MANAGED_BLOCK_START = '# BEGIN LOCAL TEST ENV (managed by npm run dev:setup)'
const MANAGED_BLOCK_END = '# END LOCAL TEST ENV'
const LOCAL_MEMBER_DISCORD_ID = 'test-auth:member'
const LOCAL_MEMBER_PROFILE_ID = '00000000-0000-4000-8000-000000000001'

function isLoopbackUrl(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

function requireStatusValue(status, key) {
  const value = status?.[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`supabase status did not return ${key}`)
  }
  return value
}

function keepOrGenerateSecret(existing, key, minLength, generateSecret) {
  const current = existing[key]?.trim()
  return current && current.length >= minLength ? current : generateSecret()
}

export function buildLocalEnvUpdates(
  status,
  existing = {},
  generateSecret = () => randomBytes(32).toString('hex'),
) {
  const apiUrl = requireStatusValue(status, 'API_URL')
  if (!isLoopbackUrl(apiUrl)) {
    throw new Error('dev:setup accepts local Supabase status only')
  }

  const browserKey = status.PUBLISHABLE_KEY || status.ANON_KEY
  if (typeof browserKey !== 'string' || browserKey.length === 0) {
    throw new Error('supabase status did not return PUBLISHABLE_KEY or ANON_KEY')
  }
  const serviceRoleKey = requireStatusValue(status, 'SERVICE_ROLE_KEY')

  return {
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: browserKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    APP_URL: 'http://localhost:3000',
    TENANT_ROOT_DOMAIN: 'localhost',
    NEXT_PUBLIC_TENANT_BASE_URL: '',
    ALLOWED_ORIGINS: '',
    COOKIE_SECURE: 'false',
    COOKIE_SECRET: keepOrGenerateSecret(existing, 'COOKIE_SECRET', 32, generateSecret),
    CRON_SECRET: keepOrGenerateSecret(existing, 'CRON_SECRET', 32, generateSecret),
    ENABLE_TEST_AUTH: 'true',
    TEST_AUTH_SECRET: keepOrGenerateSecret(existing, 'TEST_AUTH_SECRET', 16, generateSecret),
    TEST_SUPABASE_URL: apiUrl,
    TEST_SUPABASE_SERVICE_KEY: serviceRoleKey,
    ALLOW_REMOTE_TEST_SUPABASE: '0',
  }
}

function envKeyFromLine(line) {
  return line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1] ?? null
}

function serializeEnvValue(value) {
  return /^[A-Za-z0-9_./:@+\-=]+$/.test(value) ? value : JSON.stringify(value)
}

export function renderLocalEnv(source, updates) {
  const managedKeys = new Set(Object.keys(updates))
  const preserved = source
    .split(/\r?\n/)
    .filter((line) => {
      if (line === MANAGED_BLOCK_START || line === MANAGED_BLOCK_END) return false
      const key = envKeyFromLine(line)
      return !key || !managedKeys.has(key)
    })

  while (preserved.at(-1) === '') preserved.pop()
  const managedLines = Object.entries(updates).map(
    ([key, value]) => `${key}=${serializeEnvValue(value)}`,
  )
  return [...preserved, '', MANAGED_BLOCK_START, ...managedLines, MANAGED_BLOCK_END, ''].join('\n')
}

export function buildLocalMemberSeed(tenantId, now = new Date().toISOString()) {
  const identity = {
    discord_id: LOCAL_MEMBER_DISCORD_ID,
    albion_server: 'west',
    albion_player_name: 'LocalTestMember',
    verified_at: now,
    updated_at: now,
  }
  return {
    avatar: {
      guild_id: tenantId,
      discord_id: LOCAL_MEMBER_DISCORD_ID,
      username: 'Test member',
      albion_server: 'west',
      albion_nickname: 'LocalTestMember',
      albion_guild_id: 'local-test-guild',
      albion_verified_at: now,
      updated_at: now,
    },
    profile: {
      id: LOCAL_MEMBER_PROFILE_ID,
      ...identity,
      current_guild_id: 'local-test-guild',
      current_guild_name: 'Local Test Guild',
      is_primary: true,
      claim_status: 'claimed',
      source: 'manual_entry',
    },
    tenantLink: {
      guild_id: tenantId,
      discord_id: LOCAL_MEMBER_DISCORD_ID,
      profile_id: LOCAL_MEMBER_PROFILE_ID,
      albion_server: 'west',
      albion_player_name: 'LocalTestMember',
      current_guild_id: 'local-test-guild',
      current_guild_name: 'Local Test Guild',
      relation: 'home_guild',
      trust_status: 'trusted',
      status_reason: 'local_test_seed',
      verified_at: now,
      trusted_at: now,
      updated_at: now,
    },
  }
}

function getLocalSupabaseStatus() {
  const readStatus = () =>
    JSON.parse(
      execFileSync('supabase', ['status', '-o', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )

  try {
    return readStatus()
  } catch {
    process.stdout.write('Local Supabase is stopped; starting it now.\n')
    execFileSync('supabase', ['start'], { stdio: 'inherit' })
    return readStatus()
  }
}

function serviceHeaders(status, extra = {}) {
  const serviceRoleKey = requireStatusValue(status, 'SERVICE_ROLE_KEY')
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  }
}

async function getSeedTenant(status) {
  const apiUrl = requireStatusValue(status, 'API_URL')
  const response = await fetch(
    `${apiUrl}/rest/v1/tenants?select=id,slug&slug=eq.menhera&status=eq.active&limit=1`,
    { headers: serviceHeaders(status) },
  )
  if (!response.ok) {
    throw new Error(`local Supabase schema check failed (${response.status})`)
  }
  const tenants = await response.json()
  if (!Array.isArray(tenants) || tenants.length === 0) {
    throw new Error('local Supabase is missing the active menhera seed tenant')
  }
  return tenants[0]
}

async function upsertLocalSeed(status, table, onConflict, value) {
  const apiUrl = requireStatusValue(status, 'API_URL')
  const query = new URLSearchParams({ on_conflict: onConflict })
  const response = await fetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: 'POST',
    headers: serviceHeaders(status, {
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(value),
  })
  if (!response.ok) {
    throw new Error(`local ${table} seed failed (${response.status})`)
  }
}

async function ensureLocalTestMember(status, tenantId) {
  const seed = buildLocalMemberSeed(tenantId)
  await upsertLocalSeed(status, 'account_albion_profiles', 'id', seed.profile)
  await upsertLocalSeed(status, 'guild_avatars', 'guild_id,discord_id', seed.avatar)
  await upsertLocalSeed(
    status,
    'account_albion_tenant_links',
    'guild_id,discord_id',
    seed.tenantLink,
  )
}

async function main() {
  const source = await readFile(ENV_PATH, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return ''
    throw error
  })
  const existing = source ? parseEnv(source) : {}
  const status = getLocalSupabaseStatus()
  const updates = buildLocalEnvUpdates(status, existing)

  const tenant = await getSeedTenant(status)
  await ensureLocalTestMember(status, tenant.id)
  await writeFile(ENV_PATH, renderLocalEnv(source, updates), { mode: 0o600 })
  await chmod(ENV_PATH, 0o600)

  process.stdout.write(
    [
      'Local test environment ready.',
      '- application database: local Supabase',
      '- integration database: local Supabase (remote access blocked)',
      '- Test Auth: enabled for localhost',
      '- Test Auth member: trusted local Albion identity seeded',
      '- Discord credentials: optional and unchanged',
      '- secrets: stored only in .env.local (values hidden)',
    ].join('\n') + '\n',
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
