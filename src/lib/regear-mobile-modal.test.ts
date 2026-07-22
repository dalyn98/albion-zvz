import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/RegearRequestButton.tsx', 'utf8')

describe('regear request mobile modal', () => {
  it('keeps the form scrollable and the submit actions inside the mobile viewport', () => {
    expect(source).toContain('max-h-[92dvh] overflow-hidden flex flex-col')
    expect(source).toContain('flex-1 min-h-0 overflow-y-auto overscroll-contain')
    expect(source).toContain('safe-area-bottom flex-shrink-0')
  })
})
