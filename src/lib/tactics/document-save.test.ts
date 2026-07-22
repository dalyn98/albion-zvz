import { describe, expect, it } from 'vitest'
import { createDefaultTacticBoardState } from './schema'
import {
  prepareTacticDocumentSave,
  type TacticDocumentStepSaveInput,
} from './document-save'

function step(id: string, title: string): TacticDocumentStepSaveInput {
  return {
    id,
    title,
    callout: ` ${title} callout `,
    roleCallouts: { healer: ` ${title} healer ` },
    guidance: { intent: ` ${title} intent ` },
    nextStepLinks: [],
    boardState: createDefaultTacticBoardState('open-field'),
    durationSeconds: 6,
  }
}

describe('prepareTacticDocumentSave', () => {
  it('prepares every edited step for one document commit', () => {
    const result = prepareTacticDocumentSave({
      title: '  Main engage  ',
      summary: '  Full board  ',
      steps: [step('step-a', 'First'), step('step-b', 'Second')],
    })

    expect(result).toMatchObject({
      ok: true,
      document: {
        title: 'Main engage',
        summary: 'Full board',
        steps: [
          { id: 'step-a', title: 'First', callout: 'First callout' },
          { id: 'step-b', title: 'Second', callout: 'Second callout' },
        ],
      },
    })
  })

  it('rejects duplicate step ids before calling the atomic RPC', () => {
    const result = prepareTacticDocumentSave({
      title: 'Board',
      summary: '',
      steps: [step('same-step', 'One'), step('same-step', 'Two')],
    })

    expect(result).toEqual({ ok: false, code: 'duplicateStepId' })
  })

  it('filters branch links that do not target a step in the document', () => {
    const first = step('step-a', 'First')
    first.nextStepLinks = [
      { id: 'valid', label: ' Go ', targetStepId: 'step-b' },
      { id: 'missing', label: ' Missing ', targetStepId: 'step-z' },
    ]
    const result = prepareTacticDocumentSave({
      title: 'Board',
      summary: '',
      steps: [first, step('step-b', 'Second')],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.document.steps[0]?.nextStepLinks).toEqual([
        { id: 'valid', label: 'Go', targetStepId: 'step-b' },
      ])
    }
  })

  it('rejects an invalid board state without partially preparing the document', () => {
    const invalid = step('step-a', 'First')
    invalid.boardState = { version: 99 } as never

    const result = prepareTacticDocumentSave({
      title: 'Board',
      summary: '',
      steps: [invalid],
    })

    expect(result).toEqual({ ok: false, code: 'unsupportedVersion' })
  })
})
