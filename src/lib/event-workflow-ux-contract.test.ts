import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('event workflow UX', () => {
  it('keeps draft creation quick while exposing inherited policy details on demand', () => {
    const form = source('src/components/NewEventDraftForm.tsx')
    expect(form).toContain('advancedOpen')
    expect(form).toContain('quickDraftSummary')
    expect(form).toContain('selectedTemplateName')
    expect(form).toContain("emitUxWorkflowEvent({ eventType: 'validation_failed'")
    expect(form).toContain("emitUxWorkflowEvent({ eventType: 'completed'")
  })

  it('requires a publish review dialog after dirty sections have saved', () => {
    const bar = source('src/components/EventEditSaveBar.tsx')
    expect(bar).toContain('publishReviewOpen')
    expect(bar).toContain('publishSummary')
    expect(bar).toContain('getEventPublishSummary')
    expect(bar).toContain('reviewedPublishSummary')
    expect(bar).toContain('confirmPublish')
    expect(bar).toMatch(/openPublishReview[\s\S]*setPublishReviewOpen\(true\)/)
    expect(bar).toMatch(/handlePublish[\s\S]*triggerSaveAll\(\)[\s\S]*openPublishReview\(\)/)
    expect(bar).toMatch(/confirmPublish[\s\S]*publishEvent\(eventId\)/)
  })

  it('keeps the publish review reachable in short desktop viewports', () => {
    const bar = source('src/components/EventEditSaveBar.tsx')

    expect(bar).toContain("import { createPortal } from 'react-dom'")
    expect(bar).toContain('data-event-publish-review-overlay')
    expect(bar).toContain('overflow-y-auto overscroll-contain')
    expect(bar).toContain('data-event-publish-review-panel')
    expect(bar).toContain('max-h-[calc(100dvh-2rem)]')
    expect(bar).toMatch(
      /publishReviewOpen[\s\S]*createPortal\([\s\S]*data-event-publish-review-overlay[\s\S]*document\.body/,
    )
  })

  it('rechecks persisted roster absences before save navigation or publish review', () => {
    const bar = source('src/components/EventEditSaveBar.tsx')
    const action = source('src/app/actions/member-operations.ts')

    expect(bar).toContain('reviewEventMemberAbsences')
    expect(bar).toContain('absenceConflicts')
    expect(bar).toContain('continueAfterAbsenceReview')
    expect(bar).toMatch(/reviewPersistedAbsences[\s\S]*reviewEventMemberAbsences\(eventId\)/)
    expect(bar).toMatch(/handleClick[\s\S]*triggerSaveAll\(\)[\s\S]*reviewPersistedAbsences\('save'\)[\s\S]*finishSave\(\)/)
    expect(bar).toMatch(/handlePublish[\s\S]*triggerSaveAll\(\)[\s\S]*reviewPersistedAbsences\('publish'\)[\s\S]*openPublishReview\(\)/)
    expect(action).toContain(".eq('parties.event_id', eventId)")
    expect(action).toContain('listMemberAbsencesForDate')
  })
})
