import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('functional accessibility entry and recovery paths', () => {
  it('routes unavailable features to an explanatory recovery page', () => {
    const layout = source('src/app/(app-shell)/layout.tsx')
    const recoveryPage = source('src/app/(app-shell)/feature-unavailable/page.tsx')

    expect(layout).toContain("redirect(`/feature-unavailable?${params.toString()}`)")
    expect(recoveryPage).toContain('adminNextDescription')
    expect(recoveryPage).toContain('memberNextDescription')
    expect(recoveryPage).toContain('tab=features&feature=${featureKey}')
  })

  it('keeps member discovery aligned with enabled guild features', () => {
    const tour = source('src/components/MemberGuidedTour.tsx')
    const economyNav = source('src/components/MemberEconomyNav.tsx')

    expect(tour).toContain('regearAvailable')
    expect(tour).toContain('economyAvailable')
    expect(economyNav).toContain('ITEMS.filter')
    expect(economyNav).toContain('available[key]')
  })

  it('uses the same feature-filtered destinations for Discord publish and preview', () => {
    const publishAction = source('src/app/actions/discord-quick-starter-panel.ts')
    const settings = source('src/components/SettingsTabs.tsx')
    const preview = source('src/components/QuickStarterPanelSettingsForm.tsx')

    expect(publishAction).toContain('loadDiscordQuickStarterDestinations(guildId)')
    expect(settings).toContain('resolveDiscordQuickStarterDestinations(')
    expect(preview).toContain('availableDestinations.includes(destination)')
  })
})
