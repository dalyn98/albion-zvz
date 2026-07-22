import { describe, expect, it } from 'vitest'
import {
  createEditorHistory,
  reduceEditorHistory,
} from './editor-history'

describe('tactic editor history', () => {
  it('supports undo and redo while discarding redo after a new edit', () => {
    let history = createEditorHistory(['a'])
    history = reduceEditorHistory(history, { type: 'change', value: ['a', 'b'] })
    history = reduceEditorHistory(history, { type: 'change', value: ['a', 'b', 'c'] })
    history = reduceEditorHistory(history, { type: 'undo' })
    expect(history.present).toEqual(['a', 'b'])
    expect(history.future).toEqual([['a', 'b', 'c']])

    history = reduceEditorHistory(history, { type: 'change', value: ['a', 'd'] })
    expect(history.future).toEqual([])
    expect(reduceEditorHistory(history, { type: 'redo' }).present).toEqual(['a', 'd'])
  })

  it('bounds undo history and resets on a refreshed server document', () => {
    let history = createEditorHistory([0])
    for (let value = 1; value <= 120; value += 1) {
      history = reduceEditorHistory(history, { type: 'change', value: [value] })
    }
    expect(history.past).toHaveLength(100)

    history = reduceEditorHistory(history, { type: 'reset', value: [999] })
    expect(history).toEqual({ past: [], present: [999], future: [] })
  })
})
