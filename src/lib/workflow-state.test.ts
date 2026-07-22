import { describe, expect, it } from 'vitest'
import {
  createPreviewSnapshot,
  getBattleOverrideUndoAction,
  isPreviewSnapshotCurrent,
  reconcileSelectionWithVisible,
} from './workflow-state'

describe('workflow preview snapshots', () => {
  it('keeps commit enabled only for the exact content that was previewed', () => {
    const preview = createPreviewSnapshot({ loot: 'row-a', deposit: 'row-b' })

    expect(isPreviewSnapshotCurrent(preview, { loot: 'row-a', deposit: 'row-b' })).toBe(true)
    expect(isPreviewSnapshotCurrent(preview, { loot: 'row-a changed', deposit: 'row-b' })).toBe(false)
  })

  it('is stable when object keys are provided in a different order', () => {
    const preview = createPreviewSnapshot({ deposit: 'row-b', loot: 'row-a' })

    expect(isPreviewSnapshotCurrent(preview, { loot: 'row-a', deposit: 'row-b' })).toBe(true)
  })
})

describe('visible bulk selection', () => {
  it('drops hidden selections when filters change', () => {
    const selected = new Set(['visible-a', 'hidden-b', 'visible-c'])

    expect([...reconcileSelectionWithVisible(selected, ['visible-a', 'visible-c'])]).toEqual([
      'visible-a',
      'visible-c',
    ])
  })

  it('preserves selection order while removing missing records', () => {
    const selected = new Set(['task-c', 'task-a', 'removed-task'])

    expect([...reconcileSelectionWithVisible(selected, ['task-a', 'task-c'])]).toEqual([
      'task-c',
      'task-a',
    ])
  })
})

describe('battle activity override undo', () => {
  it('restores the previous manual override instead of clearing it', () => {
    expect(getBattleOverrideUndoAction('manual', 'ganking')).toBe('mark_ganking')
    expect(getBattleOverrideUndoAction('manual', 'zvz')).toBe('mark_zvz')
  })

  it('clears a new override when the prior classification was not manual', () => {
    expect(getBattleOverrideUndoAction('automatic', 'smallscale')).toBe('reset')
    expect(getBattleOverrideUndoAction('event_intent', 'zvz')).toBe('reset')
  })
})
