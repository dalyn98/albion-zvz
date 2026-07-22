import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('slot workspace UI contract', () => {
  it('shares the same party slot workspace between event and template editors', () => {
    expect(source('src/components/PartyEditorPanel.tsx')).toContain('<PartySlotWorkspace')
    expect(source('src/components/TemplateEditor.tsx')).toContain('<PartySlotWorkspace')
  })

  it('offers a persistent desktop editor and a mobile full-screen editor', () => {
    const editor = source('src/components/SlotEditor.tsx')
    expect(editor).toContain("presentation?: 'modal' | 'workspace'")
    expect(editor).toContain('lg:static')
    expect(editor).toContain('workspaceDraftHint')
  })

  it('uses live event roster drafts in the event sidebar', () => {
    const sidebar = source('src/components/EventSlotSidebar.tsx')
    expect(sidebar).toContain('useEventRosterDraftParties')
    expect(sidebar).toContain('liveParties')
  })

  it('exposes accessible hit areas for compact workspace controls', () => {
    const workspace = source('src/components/PartySlotWorkspace.tsx')
    expect(workspace).toContain('min-h-10')
    expect(workspace).toContain('min-w-10')
    expect(source('src/components/SlotWorkspaceRow.tsx')).toContain('interactive={false}')
  })
})
