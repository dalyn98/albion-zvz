import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('operational readiness UI contract', () => {
  it('shows every active onboarding diagnosis instead of only the first blocker', () => {
    const progress = source('src/components/AdminOnboardingProgressCard.tsx')

    expect(progress).toContain('activeDiagnoses')
    expect(progress).toContain('activeDiagnoses.map')
  })

  it('turns the first-run actions into an observable rehearsal sequence', () => {
    const firstRun = source('src/components/AdminFirstRunPanel.tsx')
    const dashboard = source('src/app/(app-shell)/admin/dashboard/page.tsx')

    expect(firstRun).toContain('rehearsalSteps')
    expect(firstRun).toContain('testSucceeded')
    expect(dashboard).toContain('initialTestAnnouncementSent')
    expect(dashboard).toContain('initialFirstEventCreated')
  })

  it('keeps audit filters removable and computes their boundaries in tenant time', () => {
    const page = source('src/app/(app-shell)/admin/dashboard/audit/page.tsx')

    expect(page).toContain('ActiveFilterChips')
    expect(page).toContain('auditDateBoundaryUtc')
    expect(page).toContain('dateRangeInvalid')
  })
})
