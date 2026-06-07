import { describe, expect, it } from 'vitest'
import {
  onboardSetupHref,
  resolveOnboardSetupStep,
  resolveOnboardStepState,
} from './onboard-guide'

describe('onboard setup guide routing', () => {
  it('resolves the current setup step from the onboarding pathname', () => {
    expect(resolveOnboardSetupStep('/onboard/setup/tenant-1', 'tenant-1')).toBe(1)
    expect(resolveOnboardSetupStep('/onboard/setup/tenant-1/albion', 'tenant-1')).toBe(2)
    expect(resolveOnboardSetupStep('/onboard/setup/tenant-1/rewards', 'tenant-1')).toBe(3)
  })

  it('builds stable setup step hrefs', () => {
    expect(onboardSetupHref('tenant-1', 1)).toBe('/onboard/setup/tenant-1')
    expect(onboardSetupHref('tenant-1', 2)).toBe('/onboard/setup/tenant-1/albion')
    expect(onboardSetupHref('tenant-1', 3)).toBe('/onboard/setup/tenant-1/rewards')
  })

  it('labels step state relative to the current step', () => {
    expect(resolveOnboardStepState(1, 2)).toBe('done')
    expect(resolveOnboardStepState(2, 2)).toBe('active')
    expect(resolveOnboardStepState(3, 2)).toBe('upcoming')
  })
})
