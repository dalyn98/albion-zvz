import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('tenant onboarding progressive disclosure', () => {
  it('keeps the full setup roadmap available without placing it before the active form', () => {
    const guide = source('src/components/OnboardStartGuide.tsx')
    const layout = source('src/app/(app-shell)/onboard/setup/[id]/layout.tsx')

    expect(guide).toContain('data-onboard-roadmap')
    expect(guide).toContain('<details')
    expect(guide).toContain('<summary')
    expect(layout).toContain("roadmapLabel={t('startGuideRoadmapLabel')}")
  })

  it('lets operators search long Discord role lists in the required first step', () => {
    const form = source('src/components/TenantSetupForm.tsx')
    const page = source('src/app/(app-shell)/onboard/setup/[id]/page.tsx')

    expect(form).toContain('roleQuery')
    expect(form).toContain('filteredRoles')
    expect(form).toContain('labels.roleSearchPlaceholder')
    expect(form).toContain('grid grid-cols-1 gap-2 sm:grid-cols-2')
    expect(page).toContain("roleSearchPlaceholder: t('roleSearchPlaceholder')")
  })

  it('offers a safe quick-start path before optional regear tuning', () => {
    const form = source('src/components/TenantRewardsSetupForm.tsx')
    const page = source('src/app/(app-shell)/onboard/setup/[id]/rewards/page.tsx')

    expect(form).toContain('data-onboard-advanced-settings')
    expect(form).toContain('<details')
    expect(form).toContain('labels.quickStartTitle')
    expect(form).toContain('labels.advancedSettingsLabel')
    expect(page).toContain("quickStartTitle: t('quickStartTitle')")
    expect(page).toContain("advancedSettingsLabel: t('advancedSettingsLabel')")
  })
})
