#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'https://albion-guildmanager.com'
const DEFAULT_PUBLIC_CACHE_PATHS = ['/features', '/pricing', '/faq', '/docs']
const DEFAULT_BROWSER_GROUPS = ['public']
const DEFAULT_SAMPLES = 3
const DEFAULT_BROWSER_SETTLE_MS = 1_000
const PUBLIC_CACHE_CONTROL =
  'public, s-maxage=3600, stale-while-revalidate=86400'

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function boundedPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getArgValue(argv, name) {
  const equalPrefix = `${name}=`
  const equalMatch = argv.find((arg) => arg.startsWith(equalPrefix))
  if (equalMatch) return equalMatch.slice(equalPrefix.length)

  const index = argv.indexOf(name)
  if (index >= 0 && index + 1 < argv.length) return argv[index + 1]
  return null
}

function hasArg(argv, name) {
  return argv.includes(name)
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

export function defaultOutputDir(date = new Date()) {
  return resolve('artifacts', 'production-verify', timestampSlug(date))
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const outputDir = resolve(
    getArgValue(argv, '--output-dir') ||
      env.VERIFY_OUTPUT_DIR ||
      defaultOutputDir(),
  )

  return {
    baseUrl: String(
      getArgValue(argv, '--base-url') ||
        getArgValue(argv, '--base') ||
        env.VERIFY_BASE_URL ||
        DEFAULT_BASE_URL,
    ).replace(/\/+$/, ''),
    outputDir,
    publicCachePaths:
      parseCsv(getArgValue(argv, '--public-cache-paths') || env.VERIFY_PUBLIC_CACHE_PATHS)
        .length > 0
        ? parseCsv(getArgValue(argv, '--public-cache-paths') || env.VERIFY_PUBLIC_CACHE_PATHS)
        : DEFAULT_PUBLIC_CACHE_PATHS,
    browserGroups:
      parseCsv(getArgValue(argv, '--browser-groups') || env.VERIFY_BROWSER_GROUPS)
        .length > 0
        ? parseCsv(getArgValue(argv, '--browser-groups') || env.VERIFY_BROWSER_GROUPS)
        : DEFAULT_BROWSER_GROUPS,
    samples: boundedPositiveInt(
      getArgValue(argv, '--samples') || env.VERIFY_SAMPLES,
      DEFAULT_SAMPLES,
    ),
    browserSettleMs: boundedPositiveInt(
      getArgValue(argv, '--browser-settle-ms') || env.VERIFY_BROWSER_SETTLE_MS,
      DEFAULT_BROWSER_SETTLE_MS,
    ),
    expectedCdnCacheControl:
      getArgValue(argv, '--expect-cdn-cache-control') ||
      env.VERIFY_EXPECT_CDN_CACHE_CONTROL ||
      PUBLIC_CACHE_CONTROL,
    skipCache: hasArg(argv, '--skip-cache') || env.VERIFY_SKIP_CACHE === '1',
    skipBrowser: hasArg(argv, '--skip-browser') || env.VERIFY_SKIP_BROWSER === '1',
  }
}

export function buildVerificationSteps(config) {
  const steps = []

  if (!config.skipCache) {
    steps.push({
      label: 'public-cache',
      command: process.execPath,
      args: [
        'scripts/perf-smoke.mjs',
        '--base-url',
        config.baseUrl,
        '--paths',
        config.publicCachePaths.join(','),
        '--samples',
        String(config.samples),
        '--title',
        '공개 마케팅 CDN 캐시 검증',
        '--expect-cdn-cache-control',
        config.expectedCdnCacheControl,
        '--output',
        resolve(config.outputDir, 'public-cache.md'),
      ],
    })
  }

  if (!config.skipBrowser) {
    steps.push({
      label: 'browser-public',
      command: process.execPath,
      args: [
        'scripts/browser-smoke.mjs',
        '--base-url',
        config.baseUrl,
        '--groups',
        config.browserGroups.join(','),
        '--settle-ms',
        String(config.browserSettleMs),
        '--output',
        resolve(config.outputDir, 'browser-public.md'),
        '--screenshot-dir',
        resolve(config.outputDir, 'screenshots'),
      ],
    })
  }

  return steps
}

function formatDuration(ms) {
  return `${Math.round(ms / 100) / 10}s`
}

export function formatSummary(config, results) {
  const failed = results.filter((result) => result.code !== 0)
  const lines = [
    '# Production Verify',
    '',
    `- Base URL: ${config.baseUrl}`,
    `- Output dir: ${config.outputDir}`,
    `- Result: ${results.length - failed.length} passed / ${failed.length} failed`,
    '',
    '| Step | Status | Duration |',
    '| --- | ---: | ---: |',
  ]

  for (const result of results) {
    lines.push(
      `| ${result.label} | ${result.code === 0 ? 'PASS' : `FAIL ${result.code}`} | ${formatDuration(result.durationMs)} |`,
    )
  }

  return `${lines.join('\n')}\n`
}

function runStep(step) {
  const startedAt = performance.now()
  return new Promise((resolveStep) => {
    process.stdout.write(`[verify] ${step.label}\n`)
    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    })

    child.on('close', (code) => {
      resolveStep({
        label: step.label,
        code: code ?? 1,
        durationMs: Math.round(performance.now() - startedAt),
      })
    })
    child.on('error', (error) => {
      process.stderr.write(`[verify] ${step.label}: ${error.message}\n`)
      resolveStep({
        label: step.label,
        code: 1,
        durationMs: Math.round(performance.now() - startedAt),
      })
    })
  })
}

export async function runProductionVerify(config) {
  const steps = buildVerificationSteps(config)
  await mkdir(config.outputDir, { recursive: true })

  const results = []
  for (const step of steps) {
    results.push(await runStep(step))
  }

  const summary = formatSummary(config, results)
  const summaryPath = resolve(config.outputDir, 'summary.md')
  await writeFile(summaryPath, summary)
  process.stdout.write(`[verify] summary: ${summaryPath}\n`)

  return {
    summaryPath,
    results,
    failed: results.some((result) => result.code !== 0),
  }
}

async function main() {
  const config = parseArgs()
  const result = await runProductionVerify(config)
  if (result.failed) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
