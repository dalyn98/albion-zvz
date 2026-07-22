import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('tactic editor functional controls', () => {
  it('exposes history, duplication, layer ordering, snap, and keyboard workflows', () => {
    const editor = source('src/components/tactics/TacticEditor.tsx')
    expect(editor).toContain('Undo2')
    expect(editor).toContain('Redo2')
    expect(editor).toContain('duplicateSelected')
    expect(editor).toContain('moveSelectedLayer')
    expect(editor).toContain('snapToGrid')
    expect(editor).toContain("event.key.toLowerCase() === 'z'")
    expect(editor).toContain("event.key.toLowerCase() === 'd'")
  })

  it('snaps pointer edits using the board grid size when enabled', () => {
    const canvas = source('src/components/tactics/TacticCanvas.tsx')
    expect(canvas).toContain('snapToGrid')
    expect(canvas).toContain('snapTacticPoint')
    expect(canvas).toMatch(/snapTacticPoint\([^)]*state\.canvas\.gridSize/)
  })
})
