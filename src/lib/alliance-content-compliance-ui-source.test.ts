import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('alliance content compliance UI contract', () => {
  it('uses the Menhera resolver for both member and admin navigation', () => {
    const appShell = source('src/components/AppShell.tsx')
    const sidebar = source('src/components/AppSidebar.tsx')

    expect(appShell).toContain('isMenheraAllianceContentComplianceEnabled(')
    expect(appShell).toMatch(
      /isMenheraAllianceContentComplianceEnabled\(\s*tenantCfg\?\.slug,\s*allianceContentEnabledRaw,\s*\)/,
    )
    expect(sidebar).toContain('!i.allianceContentOnly || allianceContentComplianceVisible')
  })

  it('keeps content-compliance authority separate from general insights', () => {
    const actions = source('src/app/actions/alliance-content-compliance.ts')
    const page = source(
      'src/app/(app-shell)/admin/dashboard/content-compliance/page.tsx',
    )
    const routeAccess = source('src/lib/admin-route-access.ts')

    expect(
      actions.match(
        /requireCapability\(CAP\.CONTENT_COMPLIANCE_MANAGE\)/g,
      ),
    ).toHaveLength(5)
    expect(actions).not.toContain('requireCapability(CAP.STATS_VIEW)')
    expect(page).toContain('requireLiveSession')
    expect(page).toContain('CAP.CONTENT_COMPLIANCE_MANAGE')
    expect(routeAccess).toMatch(
      /href: '\/admin\/dashboard\/content-compliance',[\s\S]{0,100}capabilities: \[CAP\.CONTENT_COMPLIANCE_MANAGE\]/,
    )
  })

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

    expect(panel).toContain('id="video-submit"')
    expect(panel).toContain('actionNotice')
    expect(panel).toContain('recentVideoReflectionLabel')
    expect(panel).toContain('MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH')
    expect(panel).toContain('actionVideoLabel')
  })

  it('unifies participation and exchange video actions and deep-links to the form', () => {
    const panel = source('src/components/MyAllianceContentCompliancePanel.tsx')
    const wallet = source('src/components/RequestExchangeForm.tsx')
    const discord = source('src/lib/discord-commands.ts')
    const loader = source('src/lib/alliance-content-compliance-data.ts')

    expect(panel).toContain("t(needsRecentVideo ? 'actionSubmitBoth' : 'actionSubmitDuty')")
    expect(panel).toContain('recentVideoCanBeReused')
    expect(panel).toContain('videoSubmissionErrorMessage')
    expect(panel).toContain('actionPreviewValid')
    expect(wallet).toContain('/me/content-compliance#video-submit')
    expect(discord).toContain('/me/content-compliance#video-submit')
    expect(loader).toContain('exchangeRecentGameplayVideoRequiredSetting')
  })

  it('does not query the Menhera gameplay-video ledger for another tenant wallet', () => {
    const wallet = source('src/components/MemberWalletSection.tsx')

    expect(wallet).toMatch(
      /isAllianceContentComplianceAvailable\(guildId\)[\s\S]*exchange_recent_gameplay_video_required[\s\S]*const required = complianceAvailable && requiredSetting !== 'false'[\s\S]*if \(!required\) \{[\s\S]*required: false[\s\S]*\.from\('member_gameplay_video_uploads'\)/,
    )
    expect(wallet).toContain('recentGameplayVideoRequired={recentGameplayVideo.required}')
  })

  it('lets compliance operators toggle the recent-video exchange requirement', () => {
    const adminPanel = source('src/components/AllianceContentComplianceAdminPanel.tsx')
    const statsPanel = source('src/components/AllianceContentComplianceStatsPanel.tsx')

    expect(adminPanel).toContain("updateAppSetting(")
    expect(adminPanel).toContain("'exchange_recent_gameplay_video_required'")
    expect(adminPanel).toContain('role="switch"')
    expect(statsPanel).toContain('dashboard.exchangeRecentGameplayVideoRequired')
  })
})
