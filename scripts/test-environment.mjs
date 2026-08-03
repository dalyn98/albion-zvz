#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MIGRATION_PATTERN = /^(\d{3})_[a-z0-9_]+[.]sql$/

function cleanVersion(value) {
  return String(value || '').trim().replace(/^v/, '')
}

export function expectedToolVersions(root = process.cwd()) {
  return {
    nodeMajor: cleanVersion(readFileSync(resolve(root, '.node-version'), 'utf8')),
    supabase: cleanVersion(readFileSync(resolve(root, '.supabase-version'), 'utf8')),
  }
}

export function validateNodeVersion(actual, expectedMajor) {
  const actualMajor = cleanVersion(actual).split('.')[0]
  if (actualMajor !== expectedMajor) {
    throw new Error(`Node ${expectedMajor}.x is required; current runtime is ${actual}`)
  }
}

export function validateIntegrationEnv(env = process.env) {
  const required = [
    'TEST_SUPABASE_URL',
    'TEST_SUPABASE_ANON_KEY',
    'TEST_SUPABASE_SERVICE_KEY',
  ]
  const missing = required.filter((name) => !env[name]?.trim())
  if (missing.length > 0) {
    throw new Error(`Required integration-test environment is missing: ${missing.join(', ')}`)
  }

  const url = new URL(env.TEST_SUPABASE_URL)
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (!localHosts.has(url.hostname) && env.ALLOW_REMOTE_TEST_SUPABASE !== '1') {
    throw new Error('Remote integration database is blocked unless ALLOW_REMOTE_TEST_SUPABASE=1')
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL?.trim() === env.TEST_SUPABASE_URL.trim()) {
    throw new Error('TEST_SUPABASE_URL must not match NEXT_PUBLIC_SUPABASE_URL')
  }
  if (env.SUPABASE_SERVICE_ROLE_KEY?.trim() === env.TEST_SUPABASE_SERVICE_KEY.trim()) {
    throw new Error('TEST_SUPABASE_SERVICE_KEY must not match SUPABASE_SERVICE_ROLE_KEY')
  }
}

export function parseMigrationList(raw) {
  const parsed = JSON.parse(String(raw).trim())
  const rows = Array.isArray(parsed) ? parsed : parsed.migrations
  if (!Array.isArray(rows)) throw new Error('Supabase migration list did not return rows')

  const local = new Set()
  const applied = new Set()
  for (const row of rows) {
    if (/^\d{3}$/.test(row?.local || '')) local.add(row.local)
    if (/^\d{3}$/.test(row?.remote || '')) applied.add(row.remote)
  }
  if (local.size === 0 || applied.size === 0) {
    throw new Error('Supabase migration list is empty or could not be parsed')
  }
  return { local, applied }
}

export function validateMigrationParity({ local, applied }) {
  const localOnly = [...local].filter((version) => !applied.has(version)).sort()
  const appliedOnly = [...applied].filter((version) => !local.has(version)).sort()
  if (localOnly.length > 0 || appliedOnly.length > 0) {
    const parts = []
    if (localOnly.length > 0) parts.push(`not applied locally: ${localOnly.join(', ')}`)
    if (appliedOnly.length > 0) parts.push(`missing migration files: ${appliedOnly.join(', ')}`)
    throw new Error(`Local Supabase migration drift detected (${parts.join('; ')})`)
  }
}

export function validateMigrationFilenames(root = process.cwd()) {
  const files = readdirSync(resolve(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql'))
  const invalid = files.filter((file) => !MIGRATION_PATTERN.test(file))
  if (invalid.length > 0) throw new Error(`Invalid migration filenames: ${invalid.join(', ')}`)
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `${command} failed`)
  }
  return result.stdout.trim()
}

export function runEnvironmentPreflight(root = process.cwd(), env = process.env) {
  const expected = expectedToolVersions(root)
  validateNodeVersion(process.version, expected.nodeMajor)
  validateIntegrationEnv(env)
  validateMigrationFilenames(root)

  const supabaseVersion = cleanVersion(run('supabase', ['--version']).split(/\s+/).at(-1))
  if (supabaseVersion !== expected.supabase) {
    throw new Error(`Supabase CLI ${expected.supabase} is required; current version is ${supabaseVersion}`)
  }

  run('supabase', ['status', '--output-format', 'json'])
  const list = run('supabase', ['migration', 'list', '--local', '--output-format', 'json'])
  validateMigrationParity(parseMigrationList(list))
  return expected
}

function main() {
  try {
    const versions = runEnvironmentPreflight()
    process.stdout.write(
      `[test-environment] ready: Node ${versions.nodeMajor}.x, Supabase ${versions.supabase}, migrations current\n`,
    )
  } catch (error) {
    process.stderr.write(`[test-environment] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
