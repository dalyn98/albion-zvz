import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/components/SlotCardPickerModals.tsx'),
  'utf8',
)

function componentSource(name: string, nextName?: string): string {
  const start = source.indexOf(`export function ${name}`)
  const end = nextName ? source.indexOf(`export function ${nextName}`) : source.length
  return source.slice(start, end)
}

describe('mobile slot signup modal source', () => {
  it('portals every signup step above the isolated event page and mobile navigation', () => {
    expect(source).toContain("import { createPortal } from 'react-dom'")
    expect(source.match(/return createPortal\(/g)).toHaveLength(3)
    expect(source.match(/document\.body/g)).toHaveLength(3)

    expect(componentSource('GearChoiceModal', 'SoloBombGearModal'))
      .toContain('return createPortal(')
    expect(componentSource('SoloBombGearModal', 'SlotApplyConfirmModal'))
      .toContain('return createPortal(')
    expect(componentSource('SlotApplyConfirmModal'))
      .toContain('return createPortal(')
  })

  it('keeps the mobile action footer above the home indicator', () => {
    expect(source.match(/safe-area-bottom/g)).toHaveLength(3)
    expect(source.match(/z-\[80\]/g)).toHaveLength(3)
  })
})
