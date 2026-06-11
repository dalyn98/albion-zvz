#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_BASE_URL = 'https://albion-guildmanager.com'
const DEFAULT_PUBLIC_PATHS = ['/features', '/pricing', '/faq']
const DEFAULT_TENANT_PATHS = ['/members', '/regear', '/shop', '/me']
const DEFAULT_SAMPLES = 3
const DEFAULT_TIMEOUT_MS = 15_000
const CDN_CACHE_HEADER_NAMES = ['cdn-cache-control', 'vercel-cdn-cache-control']

function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '')
}

function normalizePath(path) {
  const value = String(path || '').trim()
  if (!value) return '/'
  return value.startsWith('/') ? value : `/${value}`
}

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

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const today = new Date().toISOString().slice(0, 10)
  return {
    baseUrl: normalizeBaseUrl(
      getArgValue(argv, '--base-url') ||
        getArgValue(argv, '--base') ||
        env.PERF_BASE_URL ||
        DEFAULT_BASE_URL,
    ),
    tenantBaseUrl: normalizeBaseUrl(
      getArgValue(argv, '--tenant-base-url') ||
        getArgValue(argv, '--tenant-base') ||
        env.PERF_TENANT_BASE_URL ||
        '',
    ),
    paths: parseCsv(getArgValue(argv, '--paths') || env.PERF_PATHS || ''),
    samplesPerTarget: boundedPositiveInt(
      getArgValue(argv, '--samples') || env.PERF_SAMPLES,
      DEFAULT_SAMPLES,
    ),
    timeoutMs: boundedPositiveInt(
      getArgValue(argv, '--timeout-ms') || env.PERF_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
    outputPath:
      getArgValue(argv, '--output') ||
      env.PERF_OUTPUT ||
      resolve('docs', 'perf', `perf-smoke-${today}.md`),
    cookieFile: getArgValue(argv, '--cookie-file') || env.PERF_COOKIE_FILE || '',
    title: getArgValue(argv, '--title') || env.PERF_TITLE || '성능 측정',
    followRedirects: hasArg(argv, '--follow-redirects') || env.PERF_FOLLOW_REDIRECTS === '1',
    expectedCdnCacheControl:
      getArgValue(argv, '--expect-cdn-cache-control') ||
      env.PERF_EXPECT_CDN_CACHE_CONTROL ||
      '',
  }
}

function buildTarget(baseUrl, path, labelPrefix, requiresAuth = false) {
  const normalizedPath = normalizePath(path)
  return {
    label: `${labelPrefix} ${normalizedPath}`,
    url: `${baseUrl}${normalizedPath}`,
    requiresAuth,
  }
}

export function buildTargets(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL)
  const tenantBaseUrl = normalizeBaseUrl(config.tenantBaseUrl || '')
  const customPaths = Array.isArray(config.paths) ? config.paths : []

  if (customPaths.length > 0) {
    return customPaths.map((path) => buildTarget(baseUrl, path, 'custom'))
  }

  return [
    ...DEFAULT_PUBLIC_PATHS.map((path) => buildTarget(baseUrl, path, 'public')),
    ...(tenantBaseUrl
      ? DEFAULT_TENANT_PATHS.map((path) => buildTarget(tenantBaseUrl, path, 'tenant'))
      : []),
  ]
}

function median(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

export function summarizeSamples(samples) {
  const statuses = samples.map((sample) => sample.status).filter((status) => status > 0)
  const ttfbValues = samples.map((sample) => sample.ttfbMs).filter((value) => value >= 0)
  const totalValues = samples.map((sample) => sample.totalMs).filter((value) => value >= 0)
  const cacheValues = [
    ...new Set(samples.map((sample) => sample.cache).filter(Boolean)),
  ].sort()
  const cdnCacheControlValues = [
    ...new Set(samples.map((sample) => sample.cdnCacheControl).filter(Boolean)),
  ].sort()

  return {
    status: statuses[statuses.length - 1] ?? 0,
    medianTtfbMs: median(ttfbValues),
    medianTotalMs: median(totalValues),
    bestTtfbMs: ttfbValues.length > 0 ? Math.min(...ttfbValues) : 0,
    bestTotalMs: totalValues.length > 0 ? Math.min(...totalValues) : 0,
    cacheValues,
    cdnCacheControlValues,
  }
}

function formatCacheValues(values) {
  return values.length > 0 ? values.join(', ') : '-'
}

export function formatMarkdown(report) {
  const lines = [
    `# ${report.title}`,
    '',
    `- 측정 시각: ${report.measuredAt}`,
    `- 샘플 수: ${report.samplesPerTarget}`,
    '',
    '| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache | CDN Cache-Control |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ]

  for (const target of report.targets) {
    const summary = summarizeSamples(target.samples)
    lines.push([
      `| ${target.label}`,
      summary.status,
      summary.medianTtfbMs,
      summary.medianTotalMs,
      summary.bestTtfbMs,
      summary.bestTotalMs,
      formatCacheValues(summary.cacheValues),
      `${formatCacheValues(summary.cdnCacheControlValues)} |`,
    ].join(' | '))
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.',
    '- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.',
  )

  return `${lines.join('\n')}\n`
}

function headerValue(headers, names) {
  for (const name of names) {
    const value = headers[name]
    if (Array.isArray(value)) return value.filter(Boolean).join(', ')
    if (typeof value === 'string') return value
  }
  return ''
}

function sampleFromResponse(response, ttfbMs, totalMs) {
  return {
    status: response.statusCode ?? 0,
    ttfbMs,
    totalMs,
    cache: String(response.headers['x-vercel-cache'] || response.headers['x-nextjs-cache'] || ''),
    cacheControl: String(response.headers['cache-control'] || ''),
    cdnCacheControl: headerValue(response.headers, CDN_CACHE_HEADER_NAMES),
  }
}

async function readCookieHeader(cookieFile) {
  if (!cookieFile) return ''
  const raw = await readFile(cookieFile, 'utf8')
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (trimmed.toLowerCase().startsWith('cookie:')) return trimmed.slice('cookie:'.length).trim()

  const jarCookies = trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 7)
    .map((parts) => `${parts[5]}=${parts[6]}`)

  return jarCookies.length > 0 ? jarCookies.join('; ') : trimmed
}

function requestOnce(targetUrl, options) {
  const startedAt = performance.now()
  const url = new URL(targetUrl)
  const transport = url.protocol === 'http:' ? http : https

  return new Promise((resolveSample) => {
    const request = transport.request(url, {
      method: 'GET',
      timeout: options.timeoutMs,
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ko,en;q=0.8',
        'user-agent': 'albion-zvz-perf-smoke/1.0',
        ...(options.cookieHeader ? { cookie: options.cookieHeader } : {}),
      },
    }, (response) => {
      const ttfbMs = Math.round(performance.now() - startedAt)
      response.resume()

      response.on('end', async () => {
        const totalMs = Math.round(performance.now() - startedAt)
        const location = response.headers.location
        if (
          options.followRedirects &&
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          location
        ) {
          const redirectedUrl = new URL(location, url).toString()
          if (options.redirectDepth >= 5) {
            resolveSample(sampleFromResponse(response, ttfbMs, totalMs))
            return
          }
          resolveSample(await requestOnce(redirectedUrl, {
            ...options,
            redirectDepth: options.redirectDepth + 1,
          }))
          return
        }

        resolveSample(sampleFromResponse(response, ttfbMs, totalMs))
      })
    })

    request.on('timeout', () => {
      request.destroy(new Error(`timeout after ${options.timeoutMs}ms`))
    })

    request.on('error', () => {
      resolveSample({
        status: 0,
        ttfbMs: -1,
        totalMs: Math.round(performance.now() - startedAt),
        cache: '',
        cacheControl: '',
        cdnCacheControl: '',
      })
    })

    request.end()
  })
}

export async function measureTarget(target, config) {
  const cookieHeader = target.requiresAuth ? await readCookieHeader(config.cookieFile) : ''
  const samples = []

  for (let index = 0; index < config.samplesPerTarget; index += 1) {
    samples.push(await requestOnce(target.url, {
      timeoutMs: config.timeoutMs,
      cookieHeader,
      followRedirects: config.followRedirects,
      redirectDepth: 0,
    }))
  }

  return {
    ...target,
    samples,
  }
}

export async function runPerfSmoke(config) {
  const targets = buildTargets(config)
  const measuredTargets = []

  for (const target of targets) {
    measuredTargets.push(await measureTarget(target, config))
  }

  return {
    title: config.title,
    measuredAt: new Date().toISOString(),
    samplesPerTarget: config.samplesPerTarget,
    targets: measuredTargets,
  }
}

export function validateExpectedCdnCacheControl(report, expectedValue) {
  const expected = String(expectedValue || '').trim()
  if (!expected) return []

  const errors = []
  for (const target of report.targets) {
    const nonOkSamples = target.samples.filter((sample) => sample.status !== 200)
    if (nonOkSamples.length > 0) {
      const statuses = [...new Set(nonOkSamples.map((sample) => sample.status || 0))]
        .sort((a, b) => a - b)
        .join(', ')
      errors.push(`${target.label}: expected HTTP 200, got ${statuses}`)
    }

    const invalidSamples = target.samples.filter(
      (sample) => sample.status === 200 && sample.cdnCacheControl !== expected,
    )
    if (invalidSamples.length > 0) {
      const actualValues = [
        ...new Set(invalidSamples.map((sample) => sample.cdnCacheControl || '(missing)')),
      ].join(', ')
      errors.push(`${target.label}: expected CDN Cache-Control "${expected}", got ${actualValues}`)
    }
  }
  return errors
}

async function main() {
  const config = parseArgs()
  const report = await runPerfSmoke(config)
  const markdown = formatMarkdown(report)
  await mkdir(dirname(config.outputPath), { recursive: true })
  await writeFile(config.outputPath, markdown)
  process.stdout.write(`${config.outputPath}\n`)
  const validationErrors = validateExpectedCdnCacheControl(
    report,
    config.expectedCdnCacheControl,
  )
  if (validationErrors.length > 0) {
    process.stderr.write(`${validationErrors.join('\n')}\n`)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
