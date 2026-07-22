export interface EditorHistory<T> {
  past: T[]
  present: T
  future: T[]
}

export type EditorHistoryAction<T> =
  | { type: 'change'; value: T }
  | { type: 'reset'; value: T }
  | { type: 'undo' }
  | { type: 'redo' }

const MAX_HISTORY_ENTRIES = 100

export function createEditorHistory<T>(value: T): EditorHistory<T> {
  return { past: [], present: value, future: [] }
}

export function reduceEditorHistory<T>(
  history: EditorHistory<T>,
  action: EditorHistoryAction<T>,
): EditorHistory<T> {
  if (action.type === 'reset') return createEditorHistory(action.value)
  if (action.type === 'change') {
    if (Object.is(action.value, history.present)) return history
    return {
      past: [...history.past, history.present].slice(-MAX_HISTORY_ENTRIES),
      present: action.value,
      future: [],
    }
  }
  if (action.type === 'undo') {
    const previous = history.past.at(-1)
    if (previous === undefined) return history
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future],
    }
  }
  const next = history.future[0]
  if (next === undefined) return history
  return {
    past: [...history.past, history.present].slice(-MAX_HISTORY_ENTRIES),
    present: next,
    future: history.future.slice(1),
  }
}
