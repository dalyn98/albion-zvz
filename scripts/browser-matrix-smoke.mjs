#!/usr/bin/env node

import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { chromium, firefox, webkit } from 'playwright'

const ENGINES = { chromium, firefox, webkit }
const DESKTOP = { width: 1366, height: 900 }
const MOBILE = { width: 390, height: 844 }
const PUBLIC_PATHS = ['/', '/features', '/demo']

function argValue(argv, name) {
  const equal = argv.find((arg) => arg.startsWith(`${name}=`))
  if (equal) return equal.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] || '' : ''
}

function csv(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

export function parseMatrixArgs(argv = process.argv.slice(2), env = process.env) {
  const today = new Date().toISOString().slice(0, 10)
  return {
    baseUrl: String(argValue(argv, '--base-url') || env.SMOKE_BASE_URL || 'http://127.0.0.1:3000')
      .replace(/\/+$/, ''),
    engines: csv(argValue(argv, '--engines') || env.SMOKE_ENGINES || 'chromium,firefox,webkit'),
    memberStorageState: argValue(argv, '--member-storage-state') || env.SMOKE_MEMBER_STORAGE_STATE || '',
    adminStorageState: argValue(argv, '--admin-storage-state') || env.SMOKE_ADMIN_STORAGE_STATE || '',
    outputPath: argValue(argv, '--output') || env.SMOKE_MATRIX_OUTPUT ||
      resolve('artifacts', 'browser-matrix', `${today}.md`),
    screenshotDir: argValue(argv, '--screenshot-dir') || env.SMOKE_MATRIX_SCREENSHOTS ||
      resolve('artifacts', 'browser-matrix', today),
  }
}

export function buildMatrixCases(config) {
  const cases = []
  for (const engine of config.engines) {
    if (!ENGINES[engine]) throw new Error(`Unsupported browser engine: ${engine}`)
    for (const path of PUBLIC_PATHS) {
      cases.push({ engine, viewport: 'desktop', role: 'public', path, storageState: '' })
    }
    if (config.memberStorageState) {
      cases.push({
        engine,
        viewport: 'desktop',
        role: 'member',
        path: '/me',
        storageState: config.memberStorageState,
      })
    }
    if (config.adminStorageState) {
      cases.push({
        engine,
        viewport: 'desktop',
        role: 'admin',
        path: '/admin/dashboard',
        storageState: config.adminStorageState,
      })
    }
  }

  for (const path of PUBLIC_PATHS) {
    cases.push({ engine: 'chromium', viewport: 'mobile', role: 'public', path, storageState: '' })
  }
  if (config.memberStorageState) {
    cases.push({
      engine: 'chromium',
      viewport: 'mobile',
      role: 'member',
      path: '/me',
      storageState: config.memberStorageState,
    })
  }
  if (config.adminStorageState) {
    cases.push({
      engine: 'chromium',
      viewport: 'mobile',
      role: 'admin',
      path: '/admin/dashboard',
      storageState: config.adminStorageState,
    })
  }
  return cases
}

export function evaluateMatrixResult(result) {
  const reasons = []
  if (result.status !== 200) reasons.push(`HTTP ${result.status || 0}`)
  if (result.error) reasons.push(result.error)
  if (result.consoleErrors.length > 0) reasons.push(`${result.consoleErrors.length} console error(s)`)
  if (result.horizontalOverflow > 1) reasons.push(`horizontal overflow ${result.horizontalOverflow}px`)
  if (result.accessibilityViolations.length > 0) {
    reasons.push(`${result.accessibilityViolations.length} serious/critical accessibility violation(s)`)
  }
  return { passed: reasons.length === 0, reasons }
}

function slug(testCase) {
  const path = testCase.path === '/' ? 'root' : testCase.path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
  return `${testCase.engine}-${testCase.viewport}-${testCase.role}-${path}`
}

async function runCase(browser, testCase, config) {
  if (testCase.storageState) await access(testCase.storageState)
  const mobile = testCase.viewport === 'mobile'
  const context = await browser.newContext({
    viewport: mobile ? MOBILE : DESKTOP,
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
    ...(testCase.storageState ? { storageState: testCase.storageState } : {}),
  })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !/sentry|_vercel/i.test(message.text())) {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  let status = 0
  let error = ''
  let horizontalOverflow = 0
  let accessibilityViolations = []
  const screenshotPath = resolve(config.screenshotDir, `${slug(testCase)}.png`)
  try {
    const response = await page.goto(`${config.baseUrl}${testCase.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    })
    status = response?.status() || 0
    await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {})
    await page.waitForTimeout(500)
    horizontalOverflow = await page.evaluate(
      () => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth,
    )
    if (testCase.engine === 'chromium' && testCase.viewport === 'desktop') {
      const analysis = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      accessibilityViolations = analysis.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => `${violation.id}: ${violation.help}`)
    }
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' })
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
  }

  const result = {
    ...testCase,
    status,
    error,
    consoleErrors: consoleErrors.slice(0, 10),
    horizontalOverflow,
    accessibilityViolations,
    screenshotPath,
  }
  return { ...result, ...evaluateMatrixResult(result) }
}

function markdown(results) {
  const failed = results.filter((result) => !result.passed)
  const lines = [
    '# Browser Matrix Smoke',
    '',
    `- Result: ${results.length - failed.length} passed / ${failed.length} failed`,
    '',
    '| Browser | Viewport | Role | Path | Result |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const result of results) {
    lines.push(
      `| ${result.engine} | ${result.viewport} | ${result.role} | ${result.path} | ${result.passed ? 'PASS' : result.reasons.join('; ')} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

export async function runBrowserMatrix(config) {
  await mkdir(config.screenshotDir, { recursive: true })
  const cases = buildMatrixCases(config)
  const results = []
  for (const engineName of config.engines) {
    const browser = await ENGINES[engineName].launch({ headless: true })
    try {
      for (const testCase of cases.filter((entry) => entry.engine === engineName)) {
        results.push(await runCase(browser, testCase, config))
      }
    } finally {
      await browser.close()
    }
  }
  await mkdir(dirname(config.outputPath), { recursive: true })
  await writeFile(config.outputPath, markdown(results))
  return { results, failed: results.some((result) => !result.passed) }
}

async function main() {
  const config = parseMatrixArgs()
  const report = await runBrowserMatrix(config)
  process.stdout.write(`${config.outputPath}\n`)
  if (report.failed) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
