import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS_DIR = join(
  process.cwd(),
  'src/app/(app-shell)/admin/dashboard/stats/_components',
)
const PAGE_PATH = join(process.cwd(), 'src/app/(app-shell)/admin/dashboard/stats/page.tsx')

function readSource(fileName: string): string {
  return readFileSync(join(COMPONENTS_DIR, fileName), 'utf8')
}

describe('regear video proof stats filter UX', () => {
  it('updates inside the section instead of navigating the stats page', () => {
    const panelSource = readSource('RegearVideoProofPanel.tsx')
    const sectionSource = readSource('RegearVideoProofSection.tsx')
    const pageSource = readFileSync(PAGE_PATH, 'utf8')

    expect(panelSource).toContain("'use client'")
    expect(panelSource).toContain('getRegearVideoProofStats')
    expect(panelSource).toContain('<button')
    expect(panelSource).not.toContain('next/link')
    expect(panelSource).not.toContain('href=')
    expect(sectionSource).not.toContain('next/link')
    expect(sectionSource).not.toContain('href=')
    expect(pageSource).not.toContain('videoProofWindow')
  })
})
