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
    expect(bar).toMatch(/triggerSaveAll\(\)[\s\S]*setPublishReviewOpen\(true\)/)
    expect(bar).toMatch(/confirmPublish[\s\S]*publishEvent\(eventId\)/)
  })
})
