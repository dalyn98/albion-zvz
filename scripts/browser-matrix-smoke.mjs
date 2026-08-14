#!/usr/bin/env node

import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { chromium, firefox, webkit } from 'playwright'

const ENGINES = { chromium, firefox, webkit }
const DESKTOP = { width: 1366, height: 900 }
const MOBILE = { width: 390, height: 844 }
const PUBLIC_PATHS = ['/', '/features', '/demo', '/zvz-battles', '/en/docs']
const DOM_NODE_BUDGETS = new Map([['/zvz-battles', 4_000]])
const LOCALIZED_PUBLIC_CASES = [
  { path: '/ar/features', expectedLanguage: 'ar', expectedDirection: 'rtl' },
  { path: '/ar/zvz-battles', expectedLanguage: 'ar', expectedDirection: 'rtl' },
]
const MEMBER_PATHS = ['/me', '/events', '/regear']
const ADMIN_PATHS = [
  '/admin/dashboard',
  '/admin/dashboard/events',
  '/admin/dashboard/approvals',
]

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
      cases.push({
        engine,
        viewport: 'desktop',
        role: 'public',
        path,
        storageState: '',
        maxDomNodes: DOM_NODE_BUDGETS.get(path),
      })
    }
    if (engine === 'chromium') {
      for (const localizedCase of LOCALIZED_PUBLIC_CASES) {
        cases.push({
          engine,
          viewport: 'desktop',
          role: 'public',
          storageState: '',
          ...localizedCase,
        })
      }
    }
    if (config.memberStorageState) {
      for (const path of MEMBER_PATHS) {
        cases.push({
          engine,
          viewport: 'desktop',
          role: 'member',
          path,
          storageState: config.memberStorageState,
        })
      }
    }
    if (config.adminStorageState) {
      for (const path of ADMIN_PATHS) {
        cases.push({
          engine,
          viewport: 'desktop',
          role: 'admin',
          path,
          storageState: config.adminStorageState,
        })
      }
    }
  }

  for (const path of PUBLIC_PATHS) {
    cases.push({
      engine: 'chromium',
      viewport: 'mobile',
      role: 'public',
      path,
      storageState: '',
      maxDomNodes: DOM_NODE_BUDGETS.get(path),
    })
  }
  for (const localizedCase of LOCALIZED_PUBLIC_CASES) {
    cases.push({
      engine: 'chromium',
      viewport: 'mobile',
      role: 'public',
      storageState: '',
      ...localizedCase,
    })
  }
  if (config.memberStorageState) {
    for (const path of MEMBER_PATHS) {
      cases.push({
        engine: 'chromium',
        viewport: 'mobile',
        role: 'member',
        path,
        storageState: config.memberStorageState,
      })
    }
  }
  if (config.adminStorageState) {
    for (const path of ADMIN_PATHS) {
      cases.push({
        engine: 'chromium',
        viewport: 'mobile',
        role: 'admin',
        path,
        storageState: config.adminStorageState,
      })
    }
  }
  return cases
}

export function evaluateMatrixResult(result) {
  const reasons = []
  if (result.status !== 200) reasons.push(`HTTP ${result.status || 0}`)
  if (result.error) reasons.push(result.error)
  if (!/^https?:\/\//.test(result.finalUrl)) reasons.push(`invalid final URL ${result.finalUrl || '(empty)'}`)
  if (result.storageState && result.finalPathname !== result.path) {
    reasons.push(`authenticated route escaped to ${result.finalPathname || '(empty)'}`)
  }
  if (result.consoleErrors.length > 0) reasons.push(`${result.consoleErrors.length} console error(s)`)
  if (result.horizontalOverflow > 1) reasons.push(`horizontal overflow ${result.horizontalOverflow}px`)
  if (result.maxDomNodes && result.domNodes > result.maxDomNodes) {
    reasons.push(`DOM nodes ${result.domNodes} exceed budget ${result.maxDomNodes}`)
  }
  if (result.expectedLanguage && result.documentLanguage !== result.expectedLanguage) {
    reasons.push(`document language ${result.documentLanguage || '(empty)'}`)
  }
  if (result.expectedDirection && result.documentDirection !== result.expectedDirection) {
    reasons.push(`document direction ${result.documentDirection || '(empty)'}`)
  }
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
  let finalUrl = ''
  let finalPathname = ''
  let horizontalOverflow = 0
  let domNodes = 0
  let documentLanguage = ''
  let documentDirection = ''
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
    finalUrl = page.url()
    try {
      finalPathname = new URL(finalUrl).pathname
    } catch {
      finalPathname = ''
    }
    horizontalOverflow = await page.evaluate(
      () => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth,
    )
    domNodes = await page.locator('*').count()
    const documentLocale = await page.evaluate(() => ({
      language: document.documentElement.lang,
      direction: document.documentElement.dir || getComputedStyle(document.documentElement).direction,
    }))
    documentLanguage = documentLocale.language
    documentDirection = documentLocale.direction
    if (testCase.engine === 'chromium' && testCase.viewport === 'desktop') {
      const analysis = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
      accessibilityViolations = analysis.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => {
          const targets = violation.nodes.flatMap((node) => node.target).slice(0, 3).join(', ')
          return `${violation.id}: ${violation.help}${targets ? ` [${targets}]` : ''}`
        })
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
    finalUrl,
    finalPathname,
    consoleErrors: consoleErrors.slice(0, 10),
    horizontalOverflow,
    domNodes,
    documentLanguage,
    documentDirection,
    accessibilityViolations,
    screenshotPath,
  }
  return { ...result, ...evaluateMatrixResult(result) }
}

export function markdown(results) {
  const failed = results.filter((result) => !result.passed)
  const budgeted = results.filter((result) => result.maxDomNodes)
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
  if (budgeted.length > 0) {
    lines.push('', '## Performance budgets', '')
    lines.push('| Browser | Viewport | Path | DOM nodes | Budget |')
    lines.push('| --- | --- | --- | ---: | ---: |')
    for (const result of budgeted) {
      lines.push(
        `| ${result.engine} | ${result.viewport} | ${result.path} | ${result.domNodes} | ${result.maxDomNodes} |`,
      )
    }
  }
  if (failed.length > 0) {
    lines.push('', '## Failure details', '')
    for (const result of failed) {
      lines.push(`### ${result.engine} / ${result.viewport} / ${result.role} / ${result.path}`, '')
      if (result.error) lines.push(`- Error: ${result.error}`)
      for (const message of result.consoleErrors) lines.push(`- Console: ${message}`)
      for (const violation of result.accessibilityViolations) {
        lines.push(`- Accessibility: ${violation}`)
      }
      if (!result.error && result.consoleErrors.length === 0 && result.accessibilityViolations.length === 0) {
        lines.push(`- ${result.reasons.join('; ')}`)
      }
      lines.push('')
    }
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
