import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const OVERLAY_ROOTS = [
  'src/components',
  'src/app/(public-shell)/demo/_components',
]

function tsxFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.isFile() && path.endsWith('.tsx') ? [path] : []
  })
}

const componentFiles = OVERLAY_ROOTS.flatMap(tsxFiles)

describe('mobile overlay scroll contract', () => {
  it('routes every full-viewport overlay through the shared scroll lock', () => {
    const unlockedOverlays = componentFiles.filter((path) => {
      const source = readFileSync(path, 'utf8')
      return (
        source.includes('fixed inset-0') &&
        !source.includes('useBodyScrollLock') &&
        !source.includes('acquireBodyScrollLock')
      )
    })

    expect(unlockedOverlays).toEqual([])
  })

  it('does not let individual components restore body overflow out of order', () => {
    const directMutations = componentFiles.filter((path) =>
      readFileSync(path, 'utf8').includes('document.body.style.overflow'),
    )

    expect(directMutations).toEqual([])
  })

  it('keeps the remaining dense mobile table horizontally reachable', () => {
    const source = readFileSync('src/app/(public-shell)/demo/regear/[id]/page.tsx', 'utf8')

    expect(source).toContain('overflow-x-auto overscroll-x-contain')
    expect(source).toContain('min-w-[30rem]')
  })

  it.each([
    'src/components/MyTimezoneSetting.tsx',
    'src/components/TenantTimezoneForm.tsx',
  ])('%s stacks long timezone choices before the two-column breakpoint', (path) => {
    const source = readFileSync(path, 'utf8')

    expect(source).toContain('grid grid-cols-1 gap-2 sm:grid-cols-2')
    expect(source).toContain('min-w-0')
  })
})
