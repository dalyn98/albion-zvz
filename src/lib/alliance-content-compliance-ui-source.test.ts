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

  it('shows the effective exchange state and lets an authorized operator invalidate a recent video', () => {
    const panel = source('src/components/AllianceContentComplianceStatsPanel.tsx')
    const loader = source('src/lib/alliance-content-compliance-data.ts')

    expect(loader).toContain('recentGameplayVideos')
    expect(loader).toContain("from('member_gameplay_video_uploads')")
    expect(panel).toContain('exchangeStatusRestrictedAndVideoRequired')
    expect(panel).toContain('exchangeRecentVideoRequired')
    expect(panel).toContain('invalidateMemberGameplayVideo')
    expect(panel).toContain('exchangeVideoInvalidateTitle')
  })

  it('keeps recent-video submission feedback beside the form and includes optional reflection', () => {
    const panel = source('src/components/MyAllianceContentCompliancePanel.tsx')

    expect(panel).toContain('recentVideoNotice')
    expect(panel).toContain('recentVideoReflectionLabel')
    expect(panel).toContain('MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH')
    expect(panel).toContain('recentVideoUrlLabel')
  })
})
