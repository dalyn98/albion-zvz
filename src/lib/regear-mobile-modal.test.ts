import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/RegearRequestButton.tsx', 'utf8')
const fixedFooterSheets = [
  'src/components/RegearRequestButton.tsx',
  'src/components/RegearWindowSubmitButton.tsx',
  'src/components/AdHocDeathSubmitButton.tsx',
  'src/components/DonationRequestButton.tsx',
  'src/components/EventPayoutRequestButton.tsx',
  'src/components/BatchApplyItemsModal.tsx',
  'src/components/BatchApplySpecsModal.tsx',
  'src/components/SlotEditor.tsx',
]
const scrollingActionSheets = [
  'src/components/CraftQueueDialogs.tsx',
  'src/components/MemberAssignModal.tsx',
  'src/components/guild/BannerInlineEdit.tsx',
  'src/components/guild/GalleryInlineEdit.tsx',
]

function componentSource(path: string): string {
  return readFileSync(path, 'utf8')
}

function expectConstrainedScrollableSheet(path: string): void {
  const component = componentSource(path)
  expect(component, path).toMatch(/className=(?:"|\{`)[^"`\n]*overflow-hidden[^"`\n]*flex flex-col/)
  expect(component, path).toMatch(
    /className="[^"\n]*flex-1[^"\n]*min-h-0[^"\n]*overflow-y-auto[^"\n]*overscroll-contain/,
  )
}

describe('regear request mobile modal', () => {
  it('keeps the form scrollable and the submit actions inside the mobile viewport', () => {
    expect(source).toContain('max-h-[92dvh] overflow-hidden flex flex-col')
    expect(source).toContain('flex-1 min-h-0 overflow-y-auto overscroll-contain')
    expect(source).toContain('safe-area-bottom flex-shrink-0')
  })

  it.each(fixedFooterSheets)('%s keeps its footer reachable above the mobile safe area', (path) => {
    expectConstrainedScrollableSheet(path)
    expect(componentSource(path), path).toMatch(
      /className="[^"\n]*safe-area-bottom[^"\n]*flex-shrink-0[^"\n]*border-t/,
    )
  })

  it.each(scrollingActionSheets)('%s keeps inline actions in a contained mobile scroller', (path) => {
    expectConstrainedScrollableSheet(path)
    expect(componentSource(path), path).toMatch(
      /className="[^"\n]*safe-area-bottom[^"\n]*flex-1[^"\n]*min-h-0[^"\n]*overflow-y-auto/,
    )
  })
})
