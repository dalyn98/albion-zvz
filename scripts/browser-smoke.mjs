#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const DEFAULT_BASE_URL = 'https://albion-guildmanager.com'
const DEFAULT_GROUPS = ['public', 'demo']
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_SETTLE_MS = 1_000
const DEFAULT_MIN_TEXT_LENGTH = 500
const TODAY = new Date().toISOString().slice(0, 10)

const PUBLIC_PATHS = ['/features', '/pricing', '/faq', '/docs', '/privacy', '/terms']
const DEMO_PATHS = ['/demo', '/demo/regear', '/demo/stats', '/demo/members', '/demo/shop']
const MEMBER_PATHS = ['/me', '/members', '/regear', '/shop?q=infernal&tier=8']
const ADMIN_PATHS = [
  '/admin/dashboard',
  '/admin/dashboard/settings',
  '/admin/dashboard/audit',
  '/admin/dashboard/stats',
]

const ERROR_TEXT_PATTERN =
  /Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found/i
const LOGIN_SCREEN_PATTERN = /Discord로 로그인|내 길드에서 사용해보기|Made By Monkku/
const RAW_I18N_KEY_PATTERN = /\b[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+\b/g
const RAW_PLACEHOLDER_PATTERN = /\{[A-Za-z_$][\w$]*\}/g
const DOMAIN_LIKE_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|gg|dev|app)$/i

const REQUEST_FAILURE_IGNORE_PATTERNS = [
  /_rsc=/,
  /\/_vercel\/insights/i,
  /\/_vercel\/speed-insights/i,
  /sentry/i,
  /analytics/i,
]

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

function uniqueValues(values) {
  return [...new Set(values)].filter(Boolean)
}

function parseGroups(value) {
  const groups = parseCsv(value)
  return groups.length > 0 ? uniqueValues(groups) : DEFAULT_GROUPS
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  return {
    baseUrl: normalizeBaseUrl(
      getArgValue(argv, '--base-url') ||
        getArgValue(argv, '--base') ||
        env.SMOKE_BASE_URL ||
        DEFAULT_BASE_URL,
    ),
    groups: parseGroups(getArgValue(argv, '--groups') || env.SMOKE_GROUPS || ''),
    paths: parseCsv(getArgValue(argv, '--paths') || env.SMOKE_PATHS || ''),
    timeoutMs: boundedPositiveInt(
      getArgValue(argv, '--timeout-ms') || env.SMOKE_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
    settleMs: boundedPositiveInt(
      getArgValue(argv, '--settle-ms') || env.SMOKE_SETTLE_MS,
      DEFAULT_SETTLE_MS,
    ),
    outputPath:
      getArgValue(argv, '--output') ||
      env.SMOKE_OUTPUT ||
      resolve('artifacts', 'browser-smoke', `browser-smoke-${TODAY}.md`),
    screenshotDir:
      getArgValue(argv, '--screenshot-dir') ||
      env.SMOKE_SCREENSHOT_DIR ||
      resolve('artifacts', 'browser-smoke', TODAY),
    storageState:
      getArgValue(argv, '--storage-state') || env.SMOKE_STORAGE_STATE || '',
    memberStorageState:
      getArgValue(argv, '--member-storage-state') ||
      env.SMOKE_MEMBER_STORAGE_STATE ||
      '',
    adminStorageState:
      getArgValue(argv, '--admin-storage-state') ||
      env.SMOKE_ADMIN_STORAGE_STATE ||
      '',
    captureScreenshots:
      hasArg(argv, '--capture-screenshots') || env.SMOKE_CAPTURE_SCREENSHOTS === '1',
    includeTextExcerpts:
      hasArg(argv, '--include-text-excerpts') || env.SMOKE_INCLUDE_TEXT_EXCERPTS === '1',
  }
}

function expectedPathname(path) {
  return new URL(normalizePath(path), DEFAULT_BASE_URL).pathname
}

function buildTarget(baseUrl, group, path, options = {}) {
  const normalizedPath = normalizePath(path)
  const url = new URL(normalizedPath, baseUrl).toString()
  return {
    label: `${group} ${normalizedPath}`,
    group,
    path: normalizedPath,
    url,
    requiresAuth: Boolean(options.requiresAuth),
    authRole: options.authRole || null,
    minTextLength: options.minTextLength || DEFAULT_MIN_TEXT_LENGTH,
    expectedPathname: group === 'demo' ? '/demo' : expectedPathname(normalizedPath),
  }
}

export function buildTargets(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl || DEFAULT_BASE_URL)
  const customPaths = Array.isArray(config.paths) ? config.paths : []

  if (customPaths.length > 0) {
    return customPaths.map((path) => buildTarget(baseUrl, 'custom', path))
  }

  const groups = Array.isArray(config.groups) && config.groups.length > 0
    ? config.groups
    : DEFAULT_GROUPS
  const targets = []

  for (const group of groups) {
    if (group === 'public') {
      targets.push(...PUBLIC_PATHS.map((path) => buildTarget(baseUrl, 'public', path)))
    } else if (group === 'demo') {
      targets.push(...DEMO_PATHS.map((path) => buildTarget(baseUrl, 'demo', path)))
    } else if (group === 'member') {
      targets.push(
        ...MEMBER_PATHS.map((path) =>
          buildTarget(baseUrl, 'member', path, { requiresAuth: true, authRole: 'member' }),
        ),
      )
    } else if (group === 'admin') {
      targets.push(
        ...ADMIN_PATHS.map((path) =>
          buildTarget(baseUrl, 'admin', path, { requiresAuth: true, authRole: 'admin' }),
        ),
      )
    } else {
      throw new Error(`Unknown smoke group: ${group}`)
    }
  }

  return targets
}

export function detectRawI18nTokens(text) {
  const input = String(text || '')
  const hits = new Set()

  for (const match of input.matchAll(RAW_I18N_KEY_PATTERN)) {
    const token = match[0]
    if (DOMAIN_LIKE_PATTERN.test(token)) continue
    if (token.endsWith('.js') || token.endsWith('.ts') || token.endsWith('.tsx')) continue
    hits.add(token)
  }

  for (const match of input.matchAll(RAW_PLACEHOLDER_PATTERN)) {
    hits.add(match[0])
  }

  return [...hits].sort()
}

function shouldIgnoreRequestFailure(url, failureText) {
  if (failureText.includes('ERR_ABORTED') && REQUEST_FAILURE_IGNORE_PATTERNS.some((pattern) => pattern.test(url))) {
    return true
  }
  return REQUEST_FAILURE_IGNORE_PATTERNS.slice(1).some((pattern) => pattern.test(url))
}

function finalPathname(finalUrl) {
  try {
    return new URL(finalUrl).pathname
  } catch {
    return ''
  }
}

function isExpectedFinalPath(target, finalUrl) {
  const pathname = finalPathname(finalUrl)
  if (!target.expectedPathname) return true
  if (target.group === 'demo') return pathname === '/demo' || pathname.startsWith('/demo/')
  return pathname === target.expectedPathname
}

function authStateForTarget(target, config) {
  if (!target.requiresAuth) return ''
  if (target.authRole === 'admin') return config.adminStorageState || config.storageState || ''
  return config.memberStorageState || config.storageState || ''
}

export function evaluateTargetSnapshot(target, snapshot) {
  const reasons = []
  const rawTokens = detectRawI18nTokens(snapshot.bodyText)

  if (snapshot.error) reasons.push(`navigation error: ${snapshot.error}`)
  if (target.requiresAuth && !snapshot.usedStorageState) {
    reasons.push(`auth storage state missing for ${target.authRole || 'auth'} route`)
  }
  if (snapshot.status !== 200) reasons.push(`expected HTTP 200, got ${snapshot.status || 0}`)
  if (snapshot.finalUrl && !isExpectedFinalPath(target, snapshot.finalUrl)) {
    reasons.push(`unexpected final path: ${finalPathname(snapshot.finalUrl) || '(unknown)'}`)
  }
  if (snapshot.bodyText.length < target.minTextLength) {
    reasons.push(`body text too short: ${snapshot.bodyText.length} chars`)
  }
  if (ERROR_TEXT_PATTERN.test(snapshot.bodyText)) reasons.push('error page text detected')
  if (target.requiresAuth && LOGIN_SCREEN_PATTERN.test(snapshot.bodyText)) {
    reasons.push('auth route rendered the login screen')
  }
  if (rawTokens.length > 0) reasons.push(`raw i18n tokens detected: ${rawTokens.slice(0, 8).join(', ')}`)
  if (snapshot.consoleErrors.length > 0) reasons.push(`${snapshot.consoleErrors.length} console error(s)`)
  if (snapshot.failedRequests.length > 0) reasons.push(`${snapshot.failedRequests.length} failed request(s)`)

  return {
    passed: reasons.length === 0,
    reasons,
    rawTokens,
  }
}

function reportUrl(finalUrl) {
  if (!finalUrl) return '-'
  try {
    const url = new URL(finalUrl)
    return `${url.pathname}${url.search}`
  } catch {
    return finalUrl
  }
}

function trimText(value, maxLength = 600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function resultIcon(passed) {
  return passed ? 'PASS' : 'FAIL'
}

export function formatMarkdown(report) {
  const failed = report.results.filter((result) => !result.passed)
  const lines = [
    '# Browser Smoke 검증',
    '',
    `- 측정 시각: ${report.measuredAt}`,
    `- Base URL: ${report.baseUrl}`,
    `- 그룹: ${report.groups.join(', ')}`,
    `- 결과: ${report.results.length - failed.length} passed / ${failed.length} failed`,
    '',
    '| 화면 | 결과 | Status | Final path | Text | Raw | Console | Requests |',
    '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |',
  ]

  for (const result of report.results) {
    lines.push([
      `| ${result.label}`,
      resultIcon(result.passed),
      result.status || 0,
      reportUrl(result.finalUrl),
      result.textLength,
      result.rawTokens.length,
      result.consoleErrors.length,
      `${result.failedRequests.length} |`,
    ].join(' | '))
  }

  if (failed.length > 0) {
    lines.push('', '## 실패 상세', '')
    for (const result of failed) {
      lines.push(`### ${result.label}`, '')
      for (const reason of result.reasons) lines.push(`- ${reason}`)
      if (result.rawTokens.length > 0) {
        lines.push(`- raw tokens: ${result.rawTokens.slice(0, 20).join(', ')}`)
      }
      if (result.consoleErrors.length > 0) {
        lines.push('- console errors:')
        for (const error of result.consoleErrors.slice(0, 5)) lines.push(`  - ${trimText(error, 240)}`)
      }
      if (result.failedRequests.length > 0) {
        lines.push('- failed requests:')
        for (const request of result.failedRequests.slice(0, 5)) lines.push(`  - ${trimText(request, 240)}`)
      }
      if (result.screenshotPath) lines.push(`- screenshot: ${result.screenshotPath}`)
      if (report.includeTextExcerpts && result.bodyExcerpt) {
        lines.push('', '```text', result.bodyExcerpt, '```')
      }
      lines.push('')
    }
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- 인증 화면은 Playwright storageState 없이는 실패로 처리합니다.',
    '- 쿠키와 storageState 내용은 보고서에 기록하지 않습니다.',
    '- `_rsc` prefetch abort는 Next.js client navigation 과정에서 발생할 수 있어 실패 요청에서 제외합니다.',
  )

  return `${lines.join('\n')}\n`
}

function slugifyLabel(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function maybeCaptureScreenshot(page, target, config) {
  if (!config.captureScreenshots) return ''
  await mkdir(config.screenshotDir, { recursive: true })
  const screenshotPath = resolve(config.screenshotDir, `${slugifyLabel(target.label)}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  return screenshotPath
}

async function inspectTarget(browser, target, config) {
  const storageState = authStateForTarget(target, config)
  if (target.requiresAuth && !storageState) {
    const snapshot = {
      status: 0,
      finalUrl: target.url,
      bodyText: '',
      consoleErrors: [],
      failedRequests: [],
      usedStorageState: false,
      error: '',
    }
    const evaluation = evaluateTargetSnapshot(target, snapshot)
    return {
      ...target,
      ...evaluation,
      status: snapshot.status,
      finalUrl: snapshot.finalUrl,
      title: '',
      textLength: 0,
      consoleErrors: [],
      failedRequests: [],
      screenshotPath: '',
      bodyExcerpt: '',
    }
  }

  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    ...(storageState ? { storageState } : {}),
  })
  const page = await context.newPage()
  const consoleErrors = []
  const failedRequests = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    const failureText = request.failure()?.errorText || 'failed'
    const url = request.url()
    if (!shouldIgnoreRequestFailure(url, failureText)) {
      failedRequests.push(`${request.method()} ${url} ${failureText}`)
    }
  })

  let status = 0
  let finalUrl = target.url
  let title = ''
  let bodyText = ''
  let error = ''
  let screenshotPath = ''

  try {
    const response = await page.goto(target.url, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeoutMs,
    })
    status = response?.status() || 0
    await page.waitForLoadState('networkidle', { timeout: config.settleMs }).catch(() => {})
    await page.waitForTimeout(config.settleMs)
    finalUrl = page.url()
    title = await page.title().catch(() => '')
    bodyText = await page.locator('body').innerText({ timeout: config.timeoutMs }).catch(() => '')
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }

  const snapshot = {
    status,
    finalUrl,
    bodyText,
    consoleErrors,
    failedRequests,
    usedStorageState: Boolean(storageState),
    error,
  }
  const evaluation = evaluateTargetSnapshot(target, snapshot)

  if (!evaluation.passed) {
    screenshotPath = await maybeCaptureScreenshot(page, target, config).catch(() => '')
  }

  await context.close()

  return {
    ...target,
    ...evaluation,
    status,
    finalUrl,
    title,
    textLength: bodyText.length,
    consoleErrors: consoleErrors.slice(0, 10),
    failedRequests: failedRequests.slice(0, 10),
    screenshotPath,
    bodyExcerpt: target.requiresAuth ? '' : trimText(bodyText),
  }
}

export async function runBrowserSmoke(config) {
  const targets = buildTargets(config)
  const browser = await chromium.launch({ headless: true })
  const results = []

  try {
    for (const target of targets) {
      results.push(await inspectTarget(browser, target, config))
    }
  } finally {
    await browser.close()
  }

  return {
    baseUrl: config.baseUrl,
    groups: config.groups,
    measuredAt: new Date().toISOString(),
    includeTextExcerpts: config.includeTextExcerpts,
    results,
  }
}

async function main() {
  const config = parseArgs()
  const report = await runBrowserSmoke(config)
  const markdown = formatMarkdown(report)
  await mkdir(dirname(config.outputPath), { recursive: true })
  await writeFile(config.outputPath, markdown)
  process.stdout.write(`${config.outputPath}\n`)
  if (report.results.some((result) => !result.passed)) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
