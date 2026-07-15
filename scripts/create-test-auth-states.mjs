#!/usr/bin/env node

import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { request } from 'playwright'

const DEFAULT_BASE_URL = 'http://localhost:3000'
const DEFAULT_TENANT_SLUG = 'menhera'
const REQUIRED_COOKIES = ['user_session', 'agm_last_guild']

export function buildAuthStateDefinitions(tenantSlug = DEFAULT_TENANT_SLUG) {
  return [
    {
      role: 'member',
      tenantSlug,
      returnTo: '/me',
      outputPath: resolve('.auth/test-member.json'),
    },
    {
      role: 'admin',
      tenantSlug,
      returnTo: '/admin/dashboard',
      outputPath: resolve('.auth/test-admin.json'),
    },
  ]
}

function argValue(argv, name) {
  const withEquals = argv.find((value) => value.startsWith(`${name}=`))
  if (withEquals) return withEquals.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function validateLocalBaseUrl(rawUrl) {
  const url = new URL(rawUrl)
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Test Auth storage states can only be created against localhost')
  }
  return url.toString().replace(/\/$/, '')
}

async function createStorageState({ baseUrl, secret, definition }) {
  const context = await request.newContext({ baseURL: baseUrl })
  try {
    const response = await context.post('/api/test/auth/session', {
      headers: {
        'content-type': 'application/json',
        'x-test-auth-secret': secret,
      },
      data: {
        role: definition.role,
        tenantSlug: definition.tenantSlug,
        returnTo: definition.returnTo,
        locale: 'ko',
      },
    })
    if (!response.ok()) {
      throw new Error(`Test Auth ${definition.role} session failed (${response.status()})`)
    }

    const state = await context.storageState()
    const cookieNames = new Set(state.cookies.map((cookie) => cookie.name))
    const missing = REQUIRED_COOKIES.filter((name) => !cookieNames.has(name))
    if (missing.length > 0) {
      throw new Error(`Test Auth ${definition.role} session missed cookies: ${missing.join(', ')}`)
    }

    await mkdir(dirname(definition.outputPath), { recursive: true })
    await context.storageState({ path: definition.outputPath })
  } finally {
    await context.dispose()
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const baseUrl = validateLocalBaseUrl(argValue(argv, '--base-url') || DEFAULT_BASE_URL)
  const tenantSlug = argValue(argv, '--tenant-slug') || DEFAULT_TENANT_SLUG
  const envSource = await readFile(resolve('.env.local'), 'utf8')
  const env = parseEnv(envSource)
  const secret = env.TEST_AUTH_SECRET
  if (!env.ENABLE_TEST_AUTH || env.ENABLE_TEST_AUTH !== 'true' || !secret || secret.length < 16) {
    throw new Error('Test Auth is not configured; run npm run dev:setup first')
  }

  for (const definition of buildAuthStateDefinitions(tenantSlug)) {
    await createStorageState({ baseUrl, secret, definition })
    process.stdout.write(`${definition.role} storage state ready: ${definition.outputPath}\n`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
