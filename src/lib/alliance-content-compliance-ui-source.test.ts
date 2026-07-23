import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('alliance content compliance UI contract', () => {
  it('keeps a long pending-session queue in a bounded vertical scroll region', () => {
    const panel = source('src/components/AllianceContentComplianceAdminPanel.tsx')

    expect(panel).toContain('data-alliance-candidate-scroll')
    expect(panel).toContain('max-h-[min(70dvh,52rem)]')
    expect(panel).toContain('overflow-y-auto')
    expect(panel).toContain('overscroll-contain')
    expect(panel).toContain('sticky top-0 z-10')
  })

  it('lets an operator select pending videos and approve or reject them in bulk', () => {
    const panel = source('src/components/AllianceContentComplianceAdminPanel.tsx')

    expect(panel).toContain('data-alliance-review-scroll')
    expect(panel).toContain('selectedSubmissionIds')
    expect(panel).toContain('toggleAllSubmissions')
    expect(panel).toContain('reviewAllianceContentVideos')
    expect(panel).toContain('approveSelectedSubmissions')
    expect(panel).toContain('rejectSelectedSubmissions')
  })
})
