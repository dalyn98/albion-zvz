import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

async function loadSmokeModule() {
  return import(/* @vite-ignore */ new URL('../../scripts/slot-workspace-smoke.mjs', import.meta.url).href)
}

describe('slot workspace browser smoke contract', () => {
  it('accepts an explicit production target without embedding auth state contents', async () => {
    const { parseSlotWorkspaceSmokeArgs } = await loadSmokeModule()

    expect(parseSlotWorkspaceSmokeArgs([
      '--base-url=https://example.test/',
      '--storage-state=.auth/admin.json',
      '--event-path=/admin/dashboard/events/event-1',
    ], {})).toMatchObject({
      baseUrl: 'https://example.test',
      eventPath: '/admin/dashboard/events/event-1',
      headed: false,
    })
  })

  it('covers PC breakpoint layouts, drag, undo invalidation, sticky overlap, and mobile fallback without saving', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/slot-workspace-smoke.mjs'),
      'utf8',
    )

    expect(source).toContain('.dragTo(')
    expect(source).toContain('a later field edit must expire the structural undo receipt')
    expect(source).toContain('sticky slot editor must not overlap the event save bar')
    expect(source).toContain('rootFontSize * 5')
    expect(source).toContain('1024')
    expect(source).toContain('1280')
    expect(source).toContain('1366')
    expect(source).toContain('1600')
    expect(source).toContain('gear item trigger must focus the dedicated item search')
    expect(source).toContain('desktop item search must use a wide dialog')
    expect(source).toContain('mobile item search must use the full viewport')
    expect(source).toContain('must derive layout from the')
    expect(source).toContain('desktop overlay editor must remain usable')
    expect(source).toContain('desktop overlay editor must stay above the app sidebar')
    expect(source).toContain('mobile must retain explicit move controls')
    expect(source).toContain('page.addStyleTag')
    expect(source).not.toContain("element.style.display = 'none'")
    expect(source).not.toContain("locator('[data-event-edit-save-bar] button').click")
  })
})
