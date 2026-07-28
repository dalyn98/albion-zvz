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

  it('bounds every long compliance list instead of growing the whole page', () => {
    const adminPanel = source('src/components/AllianceContentComplianceAdminPanel.tsx')
    const statsPanel = source('src/components/AllianceContentComplianceStatsPanel.tsx')
    const memberPanel = source('src/components/MyAllianceContentCompliancePanel.tsx')

    expect(adminPanel).toContain('data-alliance-confirmed-session-scroll')
    expect(statsPanel).toContain('data-alliance-stats-scroll')
    expect(statsPanel).toContain('sticky top-0 z-10')
    expect(memberPanel).toContain('data-alliance-member-session-scroll')
    expect(memberPanel).toContain('data-alliance-requirement-scroll')
    for (const panel of [adminPanel, statsPanel, memberPanel]) {
      expect(panel).toContain('overscroll-contain')
      expect(panel).toContain('[scrollbar-gutter:stable]')
    }
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

  it('lets operators choose session or participation-day targets and filter the compact status list', () => {
    const adminPanel = source('src/components/AllianceContentComplianceAdminPanel.tsx')
    const statsPanel = source('src/components/AllianceContentComplianceStatsPanel.tsx')

    expect(adminPanel).toContain('sessionTargetEnabled')
    expect(adminPanel).toContain('participationDaysTargetEnabled')
    expect(adminPanel).toContain('weeklyMinParticipationDays')
    expect(adminPanel).toContain('hasValidParticipationTarget')
    expect(statsPanel).toContain("useState<'all' | 'below' | 'achieved'>('all')")
    expect(statsPanel).toContain('statsParticipationStatus')
    expect(statsPanel).toContain('statsSessionCriterionValue')
    expect(statsPanel).toContain('statsDaysCriterionValue')
  })

  it('keeps recent-video submission feedback beside the form and includes optional reflection', () => {
    const panel = source('src/components/MyAllianceContentCompliancePanel.tsx')

    expect(panel).toContain('recentVideoNotice')
    expect(panel).toContain('recentVideoReflectionLabel')
    expect(panel).toContain('MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH')
    expect(panel).toContain('recentVideoUrlLabel')
  })
})
