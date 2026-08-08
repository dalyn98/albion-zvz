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
    expect(form).toContain('recommendations.memberRoleId')
    expect(form).toContain('recommendations.eventChannelId')
    expect(form).toContain('grid grid-cols-1 gap-2 sm:grid-cols-2')
    expect(page).toContain("roleSearchPlaceholder: t('roleSearchPlaceholder')")
    expect(page).toContain('recommendDiscordOnboardingResources(roles, channels)')
    expect(page).toContain('const session = await getSession()')
    expect(page).toContain(".eq('created_by_discord_id', session.discordId)")
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

  it('requires an explicit regear support choice and only reveals fulfillment when supported', () => {
    const form = source('src/components/TenantRewardsSetupForm.tsx')
    const page = source('src/app/(app-shell)/onboard/setup/[id]/rewards/page.tsx')
    const action = source('src/app/actions/onboard.ts')

    expect(form).toContain('regearSupportEnabled === null')
    expect(form).toContain('labels.supportRequiredError')
    expect(form).toContain('craftRegearEnabled === null')
    expect(form).toContain('labels.fulfillmentRequiredError')
    expect(form).toContain('regearSupportEnabled && (')
    expect(page).toContain("getAppSetting('regear_support_enabled', '', id)")
    expect(page).toContain("getAppSetting('craft_regear_enabled', '', id)")
    expect(action).toContain("key: 'regear_support_enabled'")
    expect(action).toContain("typeof input.policy?.regearSupportEnabled !== 'boolean'")
    expect(action).toContain("typeof input.policy.craftRegearEnabled !== 'boolean'")
    expect(action).toContain('if (input.policy.regearSupportEnabled)')
  })

  it('requires an explicit participant-roster closeout mode and persists it for the tenant', () => {
    const form = source('src/components/TenantRewardsSetupForm.tsx')
    const page = source('src/app/(app-shell)/onboard/setup/[id]/rewards/page.tsx')
    const action = source('src/app/actions/onboard.ts')

    expect(form).toContain('participationAutoCloseoutEnabled === null')
    expect(form).toContain('labels.participationCloseoutRequiredError')
    expect(form).toContain('labels.participationCloseoutAutomaticLabel')
    expect(form).toContain('labels.participationCloseoutManualLabel')
    expect(page).toContain(
      "getAppSetting('event_participation_auto_closeout_enabled', '', id)",
    )
    expect(action).toContain(
      "typeof input.policy.participationAutoCloseoutEnabled !== 'boolean'",
    )
    expect(action).toMatch(
      /key: 'event_participation_auto_closeout_enabled',[\s\S]*participationAutoCloseoutEnabled \? 'true' : 'false'/,
    )
  })
})
