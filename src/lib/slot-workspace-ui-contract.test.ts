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

  it('offers a persistent wide-desktop editor and a full-screen editor in narrow app shells', () => {
    const editor = source('src/components/SlotEditor.tsx')
    expect(editor).toContain("presentation?: 'modal' | 'workspace'")
    expect(editor).toContain('min-[1600px]:static')
    expect(editor).toContain('min-[1600px]:sticky')
    expect(editor).not.toContain('lg:static lg:z-auto lg:block')
    expect(editor).toContain('workspaceDraftHint')
    expect(editor).toContain("getElementById('app-main-content')")
    expect(editor).toContain("appFrame.style.zIndex = '60'")
    expect(editor).toContain('if (editorBox.width === 0) return')
    expect(editor).not.toContain('editorBox.width === 0 || editorBox.height === 0')
  })

  it('keeps the standalone build-template workspace on its existing desktop layout', () => {
    const editor = source('src/components/SlotEditor.tsx')
    const buildTemplateEditor = source('src/components/BuildTemplateEditor.tsx')

    expect(buildTemplateEditor).toContain('presentation="workspace"')
    expect(buildTemplateEditor).not.toContain('onWorkspaceClose=')
    expect(editor).toContain('data-desktop-min-width={hasWorkspaceOverlay ? 560 : undefined}')
    expect(editor).toContain('lg:sticky lg:top-20 lg:h-auto')
  })

  it('delays split grids and the secondary event sidebar until their containers have room', () => {
    const workspace = source('src/components/PartySlotWorkspace.tsx')
    const eventEditPage = source('src/app/(app-shell)/admin/dashboard/events/[id]/page.tsx')
    const dashboardLayout = source('src/app/(app-shell)/admin/dashboard/layout.tsx')
    const memberEventPage = source('src/app/(app-shell)/events/[id]/page.tsx')
    const assignmentBoard = source('src/components/BuildSheetAssignmentBoard.tsx')
    const templateEditor = source('src/components/TemplateEditor.tsx')
    const shopCatalog = source('src/components/ShopCatalog.tsx')

    expect(workspace).toContain('min-[1600px]:grid-cols-[minmax(18rem,0.8fr)_minmax(40rem,1.7fr)]')
    expect(workspace).not.toContain('lg:grid-cols-[minmax(17rem,0.82fr)_minmax(0,1.6fr)]')
    expect(eventEditPage).toContain('xl:flex-row')
    expect(eventEditPage).toContain('min-[1800px]:hidden')
    expect(eventEditPage).toContain('hidden min-[1800px]:block')
    expect(dashboardLayout).toContain('2xl:max-w-[1600px]')
    expect(memberEventPage).toContain('hidden xl:block')
    expect(templateEditor).toContain('hidden xl:block')
    expect(assignmentBoard).toContain('2xl:grid-cols-[17rem_minmax(0,1fr)]')
    expect(shopCatalog).toContain('xl:grid-cols-[1fr_20rem]')
    expect(shopCatalog).not.toContain('lg:grid-cols-[1fr_20rem]')
  })

  it('uses live event roster drafts in the event sidebar', () => {
    const sidebar = source('src/components/EventSlotSidebar.tsx')
    expect(sidebar).toContain('useEventRosterDraftParties')
    expect(sidebar).toContain('liveParties')
  })

  it('exposes accessible hit areas for compact workspace controls', () => {
    const workspace = source('src/components/PartySlotWorkspace.tsx')
    const row = source('src/components/SlotWorkspaceRow.tsx')
    expect(workspace).toContain('min-h-10')
    expect(workspace).toContain('min-w-10')
    expect(row).toContain('interactive={false}')
    expect(row).toContain('shrink-0 whitespace-nowrap')
    expect(row).toContain('flex min-[1600px]:hidden')
    expect(row).toContain('hidden items-center gap-1 min-[2100px]:flex')
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
