#!/usr/bin/env node

import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const DEFAULT_BASE_URL = 'https://albion-guildmanager.com'
const DEFAULT_TIMEOUT_MS = 45_000

function argumentValue(argv, name) {
  const inline = argv.find((value) => value.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] ?? '' : ''
}

export function parseSlotWorkspaceSmokeArgs(argv = process.argv.slice(2), env = process.env) {
  return {
    baseUrl: String(
      argumentValue(argv, '--base-url') || env.SMOKE_BASE_URL || DEFAULT_BASE_URL,
    ).replace(/\/+$/, ''),
    storageState: resolve(
      argumentValue(argv, '--storage-state') ||
        env.SMOKE_ADMIN_STORAGE_STATE ||
        '.auth/test-admin.json',
    ),
    eventPath: argumentValue(argv, '--event-path') || '',
    timeoutMs: Number.parseInt(
      argumentValue(argv, '--timeout-ms') || env.SMOKE_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
      10,
    ),
    headed: argv.includes('--headed'),
  }
}

function normalizeEventPath(href, baseUrl) {
  const url = new URL(href, baseUrl)
  if (!/^\/admin\/dashboard\/events\/[^/?]+$/.test(url.pathname)) return ''
  if (url.pathname.endsWith('/new')) return ''
  return url.pathname
}

async function suppressLocalTestOnboarding(page, config) {
  const hostname = new URL(config.baseUrl).hostname
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return
  await page.addStyleTag({
    content: '[aria-labelledby="albion-onboarding-title"] { display: none !important; }',
  })
}

async function eventPathsFromList(page, baseUrl) {
  const hrefs = await page.locator('a[href*="/admin/dashboard/events/"]').evaluateAll((links) =>
    links.map((link) => link.getAttribute('href') ?? ''),
  )
  return [...new Set(hrefs.map((href) => normalizeEventPath(href, baseUrl)).filter(Boolean))]
}

async function localSmokeFixturePaths(page, config) {
  const hostname = new URL(config.baseUrl).hostname
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') return []
  const hrefs = await page
    .locator('a[href*="/admin/dashboard/events/"]', { hasText: 'Codex slot workspace smoke' })
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  return [...new Set(hrefs
    .map((href) => normalizeEventPath(href, config.baseUrl))
    .filter(Boolean))]
}

async function openFirstSlotWorkspace(page, config) {
  const workspace = page.locator('[data-slot-workspace]').first()
  await workspace.waitFor({ state: 'attached', timeout: config.timeoutMs })
  const partyDetails = workspace.locator('xpath=ancestor::details[1]')
  if (await partyDetails.count()) {
    const isOpen = await partyDetails.evaluate((element) => element.open)
    if (!isOpen) await partyDetails.locator('summary').first().click()
  }
  await workspace.waitFor({ state: 'visible', timeout: config.timeoutMs })
  return workspace
}

async function discoverEditableEvent(page, config) {
  if (config.eventPath) {
    await page.goto(new URL(config.eventPath, config.baseUrl).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: config.timeoutMs,
    })
    await suppressLocalTestOnboarding(page, config)
    return { eventPath: config.eventPath, createdFixture: false }
  }

  await page.goto(`${config.baseUrl}/admin/dashboard/events`, {
    waitUntil: 'domcontentloaded',
    timeout: config.timeoutMs,
  })
  await suppressLocalTestOnboarding(page, config)
  assert.match(page.url(), /\/admin\/dashboard\/events/, 'admin session did not reach the event list')

  const fixturePaths = new Set(await localSmokeFixturePaths(page, config))
  const paths = await eventPathsFromList(page, config.baseUrl)
  const endedTab = page.locator('#event-status-tab-ended')
  if (await endedTab.count()) {
    await endedTab.click()
    await page.waitForTimeout(250)
    paths.push(...await eventPathsFromList(page, config.baseUrl))
    for (const path of await localSmokeFixturePaths(page, config)) fixturePaths.add(path)
  }

  for (const path of [...new Set([...fixturePaths, ...paths])]) {
    await page.goto(`${config.baseUrl}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeoutMs,
    })
    await suppressLocalTestOnboarding(page, config)
    if (await page.locator('[data-slot-workspace]').count()) {
      return { eventPath: path, createdFixture: fixturePaths.has(path) }
    }
  }

  const hostname = new URL(config.baseUrl).hostname
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error('no editable event with a slot workspace was found')
  }
  await page.goto(`${config.baseUrl}/admin/dashboard/events/new`, {
    waitUntil: 'domcontentloaded',
    timeout: config.timeoutMs,
  })
  await suppressLocalTestOnboarding(page, config)
  const title = `Codex slot workspace smoke ${Date.now()}`
  await page.locator('input[type="text"]').first().fill(title)
  await page.locator('[data-create-event-draft]').click()
  await page.waitForURL(
    (url) => Boolean(normalizeEventPath(url.href, config.baseUrl)),
    { timeout: config.timeoutMs },
  )
  const eventPath = new URL(page.url()).pathname
  return { eventPath, createdFixture: true }
}

async function ensureTwoRows(workspace) {
  const rows = workspace.locator('[data-slot-workspace-row]')
  while (await rows.count() < 2) {
    const add = workspace.locator('[data-slot-add]').first()
    assert.equal(await add.count(), 1, 'workspace cannot create a second draft slot')
    await add.click()
  }
  return rows
}

async function ensureOneRow(workspace) {
  const rows = workspace.locator('[data-slot-workspace-row]')
  if (await rows.count() === 0) {
    const add = workspace.locator('[data-slot-add]').first()
    assert.equal(await add.count(), 1, 'workspace cannot create a draft slot')
    await add.click()
  }
  return rows
}

async function rowOrder(workspace) {
  return workspace.locator('[data-slot-workspace-row]').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-slot-id') ?? ''),
  )
}

async function dragFirstRowAfterSecond(workspace) {
  const rows = workspace.locator('[data-slot-workspace-row]')
  const first = rows.nth(0)
  const second = rows.nth(1)
  const targetBox = await second.boundingBox()
  assert.ok(targetBox, 'second slot row is not visible')
  await first.locator('[data-slot-drag-handle]').dragTo(second, {
    targetPosition: { x: Math.max(8, targetBox.width / 2), y: Math.max(8, targetBox.height - 4) },
  })
  await workspace.page().waitForTimeout(200)
}

async function assertNoHorizontalOverflow(page, viewportWidth) {
  const scrollWidth = await page.evaluate(() => Math.max(
    document.body?.scrollWidth ?? 0,
    document.documentElement.scrollWidth,
  ))
  assert.ok(
    scrollWidth <= viewportWidth,
    `desktop page must not overflow horizontally (${scrollWidth}px > ${viewportWidth}px)`,
  )
}

async function verifyResponsiveBreakpoints(page, eventPath, config) {
  for (const width of [1024, 1180, 1280, 1366, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${config.baseUrl}${eventPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeoutMs,
    })
    await suppressLocalTestOnboarding(page, config)
    const workspace = await openFirstSlotWorkspace(page, config)
    const rows = await ensureOneRow(workspace)
    const editor = workspace.locator('[data-slot-workspace-editor]')
    const workspaceWidth = Math.round((await workspace.boundingBox())?.width ?? 0)
    const expectedLayout = workspaceWidth >= 1040 ? 'inline' : 'overlay'
    assert.equal(
      await workspace.getAttribute('data-slot-workspace-layout'),
      expectedLayout,
      `${width}px viewport must derive layout from the ${workspaceWidth}px workspace`,
    )

    if (expectedLayout === 'inline') {
      await editor.waitFor({ state: 'visible', timeout: config.timeoutMs })
      assert.equal(await editor.getAttribute('aria-modal'), 'false', `${width}px editor must stay inline`)
      const layout = await editor.evaluate((element) => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return {
          position: style.position,
          width: Math.round(box.width),
        }
      })
      assert.equal(layout.position, 'sticky', `${width}px editor must follow desktop scrolling`)
      assert.ok(layout.width >= 720, `${width}px inline editor must retain at least 720px`)
    } else {
      assert.equal(await editor.isVisible(), false, `${width}px must not render a compressed split editor`)
      await rows.nth(0).locator('[data-slot-activate]').click()
      await editor.waitFor({ state: 'visible', timeout: config.timeoutMs })
      assert.equal(await editor.getAttribute('aria-modal'), 'true', `${width}px editor must use an overlay`)
      const editorBox = await editor.boundingBox()
      assert.ok(
        editorBox && editorBox.width >= width - 2,
        `desktop overlay editor must remain usable at ${width}px`,
      )
      assert.equal(
        await page.evaluate(() => Boolean(
          document.elementFromPoint(32, 96)?.closest('[data-slot-workspace-editor]'),
        )),
        true,
        `desktop overlay editor must stay above the app sidebar at ${width}px`,
      )
      await editor.locator('[data-slot-workspace-close]').first().click()
      await editor.waitFor({ state: 'hidden', timeout: config.timeoutMs })
    }
    await assertNoHorizontalOverflow(page, width)
  }
}

async function verifyDesktop(page, eventPath, config) {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`${config.baseUrl}${eventPath}`, {
    waitUntil: 'domcontentloaded',
    timeout: config.timeoutMs,
  })
  await suppressLocalTestOnboarding(page, config)
  const workspace = await openFirstSlotWorkspace(page, config)
  await workspace.scrollIntoViewIfNeeded()
  await page.waitForTimeout(100)
  const rows = await ensureTwoRows(workspace)
  const originalOrder = await rowOrder(workspace)

  const inlineEditor = workspace.locator('[data-slot-workspace-editor]')
  await page.waitForTimeout(250)
  const inlineLayout = await inlineEditor.evaluate((element) => {
    const editorStyle = getComputedStyle(element)
    const containerStyle = element.parentElement ? getComputedStyle(element.parentElement) : null
    const box = element.getBoundingClientRect()
    const saveBarBox = document.querySelector('[data-event-edit-save-bar]')?.getBoundingClientRect()
    return {
      viewportWidth: window.innerWidth,
      containerDisplay: containerStyle?.display ?? '',
      editorDisplay: editorStyle.display,
      editorHeight: Math.round(box.height),
      editorTop: Math.round(box.top),
      editorMaxHeight: editorStyle.maxHeight,
      saveBarTop: Math.round(saveBarBox?.top ?? -1),
      saveBarBottom: Math.round(saveBarBox?.bottom ?? -1),
      scrollY: Math.round(window.scrollY),
    }
  })
  assert.equal(
    await inlineEditor.isVisible(),
    true,
    `1600px split editor must be visible (${JSON.stringify(inlineLayout)})`,
  )
  assert.equal(await inlineEditor.getAttribute('aria-modal'), 'false', '1600px editor must use the split layout')
  const inlineEditorBox = await inlineEditor.boundingBox()
  assert.ok(
    inlineEditorBox && inlineEditorBox.width >= 720,
    `wide desktop slot editor must retain at least 720px (got ${Math.round(inlineEditorBox?.width ?? 0)}px)`,
  )
  await assertNoHorizontalOverflow(page, 1600)

  const directGearKey = 'weapon'
  await inlineEditor.locator(`[data-build-preview-edit="${directGearKey}"]`).click()
  await inlineEditor
    .locator(`[data-gear-section="${directGearKey}"] [data-item-picker-trigger]`)
    .click()
  const searchDialog = page.locator('[data-item-picker-dialog]')
  await searchDialog.waitFor({ state: 'visible', timeout: config.timeoutMs })
  const directSearch = searchDialog.locator('[data-item-picker-search]')
  assert.equal(
    await directSearch.evaluate((element) => element === document.activeElement),
    true,
    'gear item trigger must focus the dedicated item search',
  )
  assert.ok(
    Number.parseFloat(await directSearch.evaluate((element) => getComputedStyle(element).fontSize)) >= 16,
    'desktop item search input must remain legible',
  )
  const searchDialogBox = await searchDialog.locator('[role="dialog"]').boundingBox()
  assert.ok(searchDialogBox && searchDialogBox.width >= 700, 'desktop item search must use a wide dialog')
  await directSearch.fill('mace')
  await searchDialog.locator('[data-item-picker-result]').first().waitFor({
    state: 'visible',
    timeout: config.timeoutMs,
  })
  await searchDialog.locator('[data-item-picker-close]').click()
  await searchDialog.waitFor({ state: 'hidden', timeout: config.timeoutMs })

  assert.equal(await rows.nth(0).getAttribute('draggable'), null, 'the entire slot row must not be draggable')
  assert.equal(
    await rows.nth(0).locator('[data-slot-drag-handle]').getAttribute('draggable'),
    'true',
    'desktop drag handle must own draggable behavior',
  )

  await rows.nth(0).locator('input[type="checkbox"]').check()
  await rows.nth(1).locator('input[type="checkbox"]').check()
  await workspace.locator('[data-slot-selection-toolbar]').waitFor({ state: 'visible' })
  await workspace.locator('[data-slot-selection-toolbar] button').first().click()

  await rows.nth(0).locator('[data-slot-more-actions]').click()
  await rows.nth(0).locator('[data-slot-actions-menu]').waitFor({ state: 'visible' })
  await page.keyboard.press('Escape')

  await dragFirstRowAfterSecond(workspace)
  const movedOrder = await rowOrder(workspace)
  assert.equal(movedOrder[0], originalOrder[1], 'drag should move the first slot after the second')
  assert.equal(movedOrder[1], originalOrder[0], 'drag should preserve the moved slot identity')
  assert.equal(
    await workspace.locator('[data-drop-position]').count(),
    0,
    'drop indicator must clear after the drag completes',
  )
  await workspace.locator('[data-slot-workspace-undo] button').click()
  assert.deepEqual(await rowOrder(workspace), originalOrder, 'undo should restore the original order')

  await dragFirstRowAfterSecond(workspace)
  await inlineEditor.locator('details summary').last().click()
  const notes = workspace.locator('[data-slot-workspace-notes]').first()
  const existingNotes = await notes.inputValue()
  await notes.fill(`${existingNotes} `)
  assert.equal(
    await workspace.locator('[data-slot-workspace-undo]').count(),
    0,
    'a later field edit must expire the structural undo receipt',
  )

  const editorBox = await workspace.locator('[data-slot-workspace-editor]').boundingBox()
  const saveBarBox = await page.locator('[data-event-edit-save-bar]').boundingBox()
  assert.ok(editorBox && saveBarBox, 'desktop editor and save bar must be measurable')
  assert.ok(
    editorBox.y + editorBox.height <= saveBarBox.y + 2,
    `sticky slot editor must not overlap the event save bar (editor bottom ${Math.round(editorBox.y + editorBox.height)}, save bar top ${Math.round(saveBarBox.y)})`,
  )

  await page.reload({ waitUntil: 'domcontentloaded', timeout: config.timeoutMs })
}

async function verifyMobile(page, eventPath, config) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${config.baseUrl}${eventPath}`, {
    waitUntil: 'domcontentloaded',
    timeout: config.timeoutMs,
  })
  await suppressLocalTestOnboarding(page, config)
  const workspace = await openFirstSlotWorkspace(page, config)
  const rows = await ensureOneRow(workspace)

  assert.equal(
    await rows.nth(0).locator('[data-slot-drag-handle]').isVisible(),
    false,
    'native drag handle must stay hidden on touch layouts',
  )
  assert.equal(
    await rows.nth(0).locator('[data-slot-move-controls] button').count(),
    2,
    'mobile must retain explicit move controls',
  )

  const editor = workspace.locator('[data-slot-workspace-editor]')
  if (!await editor.isVisible()) {
    await rows.nth(0).locator('[data-slot-activate]').click()
  }
  await editor.waitFor({ state: 'visible' })
  assert.equal(await editor.getAttribute('aria-modal'), 'true', 'mobile editor must be modal')
  assert.equal(await page.locator('body').evaluate((body) => getComputedStyle(body).overflow), 'hidden')
  await editor.locator('[data-build-preview-edit="weapon"]').click()
  await editor.locator('[data-gear-section="weapon"] [data-item-picker-trigger]').click()
  const searchDialog = page.locator('[data-item-picker-dialog]')
  await searchDialog.waitFor({ state: 'visible', timeout: config.timeoutMs })
  const searchBox = await searchDialog.locator('[role="dialog"]').boundingBox()
  assert.ok(
    searchBox && searchBox.width >= 389 && searchBox.height >= 843,
    'mobile item search must use the full viewport',
  )
  assert.ok(
    Number.parseFloat(await searchDialog.locator('[data-item-picker-search]').evaluate(
      (element) => getComputedStyle(element).fontSize,
    )) >= 16,
    'mobile item search must not trigger browser zoom',
  )
  await searchDialog.locator('[data-item-picker-close]').click()
  await searchDialog.waitFor({ state: 'hidden', timeout: config.timeoutMs })
  await editor.locator('[data-slot-workspace-close]').first().click()
  await editor.waitFor({ state: 'hidden' })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: config.timeoutMs })
}

async function deleteLocalFixture(page, eventPath, config) {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${config.baseUrl}${eventPath}`, {
    waitUntil: 'domcontentloaded',
    timeout: config.timeoutMs,
  })
  await suppressLocalTestOnboarding(page, config)
  const deleteButton = page.locator('[data-event-delete]').first()
  // A freshly-created local draft can be session-only until the first save.
  // In that case there is no persisted event to clean up.
  if (!await deleteButton.count()) return
  await deleteButton.waitFor({ state: 'visible', timeout: config.timeoutMs })
  await deleteButton.click({ timeout: config.timeoutMs })
  const dialog = page.locator('[role="dialog"]').last()
  await dialog.waitFor({ state: 'visible' })
  await dialog.locator('button').last().click()
  await page.waitForURL(/\/admin\/dashboard\/events(?:\?.*)?$/, { timeout: config.timeoutMs })
}

export async function runSlotWorkspaceSmoke(config) {
  await access(config.storageState)
  const browser = await chromium.launch({ headless: !config.headed })
  try {
    const context = await browser.newContext({ storageState: config.storageState })
    const page = await context.newPage()
    const discovery = await discoverEditableEvent(page, config)
    try {
      await verifyResponsiveBreakpoints(page, discovery.eventPath, config)
      await verifyDesktop(page, discovery.eventPath, config)
      await verifyMobile(page, discovery.eventPath, config)
      return { eventPath: discovery.eventPath, checks: 44 }
    } finally {
      await page.close()
      await context.close()
      if (discovery.createdFixture) {
        const cleanupContext = await browser.newContext({ storageState: config.storageState })
        const cleanupPage = await cleanupContext.newPage()
        try {
          await deleteLocalFixture(cleanupPage, discovery.eventPath, config)
        } finally {
          await cleanupPage.close()
          await cleanupContext.close()
        }
      }
    }
  } finally {
    await browser.close()
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
if (isDirectRun) {
  const config = parseSlotWorkspaceSmokeArgs()
  runSlotWorkspaceSmoke(config)
    .then((result) => {
      process.stdout.write(`slot workspace smoke PASS (${result.checks} checks, ${result.eventPath})\n`)
    })
    .catch((error) => {
      process.stderr.write(`slot workspace smoke FAIL: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    })
}
