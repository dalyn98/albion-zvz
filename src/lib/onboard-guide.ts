export type OnboardSetupStep = 1 | 2 | 3
export type OnboardStepState = 'done' | 'active' | 'upcoming'

export const ONBOARD_SETUP_STEPS = [1, 2, 3] as const satisfies readonly OnboardSetupStep[]

export function resolveOnboardSetupStep(
  pathname: string,
  tenantId: string,
): OnboardSetupStep {
  if (pathname.endsWith(`/onboard/setup/${tenantId}/rewards`)) return 3
  if (pathname.endsWith(`/onboard/setup/${tenantId}/albion`)) return 2
  return 1
}

export function onboardSetupHref(
  tenantId: string,
  step: OnboardSetupStep,
): string {
  if (step === 1) return `/onboard/setup/${tenantId}`
  if (step === 2) return `/onboard/setup/${tenantId}/albion`
  return `/onboard/setup/${tenantId}/rewards`
}

export function resolveOnboardStepState(
  step: OnboardSetupStep,
  current: OnboardSetupStep,
): OnboardStepState {
  if (step < current) return 'done'
  if (step === current) return 'active'
  return 'upcoming'
}
