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
    expect(editor).toContain("getElementById('app-main-content')")
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

  it('uses a dedicated desktop drag handle with drop feedback and mobile move controls', () => {
    const row = source('src/components/SlotWorkspaceRow.tsx')
    expect(row).toContain('data-slot-drag-handle')
    expect(row).toContain('data-drop-position')
    expect(row).toContain('data-slot-move-controls')
    expect(row).toContain("canMoveDown ? 'top-full mt-1' : 'bottom-full mb-1'")
    expect(row).not.toContain('<div\n      draggable')
  })

  it('portals batch dialogs above the isolated app frame', () => {
    expect(source('src/components/BatchApplyItemsModal.tsx')).toContain('createPortal(')
    expect(source('src/components/BatchApplySpecsModal.tsx')).toContain('createPortal(')
  })

  it('reserves the global save bar height and exposes interaction telemetry', () => {
    const editor = source('src/components/SlotEditor.tsx')
    const saveBar = source('src/components/EventEditSaveBar.tsx')
    const workspace = source('src/components/PartySlotWorkspace.tsx')
    expect(editor).toContain('--event-save-bar-height')
    expect(editor).toContain('--slot-workspace-max-height')
    expect(editor).toContain('slotWorkspaceEditorMaxHeight')
    expect(saveBar).toContain('ResizeObserver')
    expect(saveBar).toContain("workflow: 'event_edit'")
    expect(workspace).toContain("workflow: 'slot_workspace'")
  })
})
