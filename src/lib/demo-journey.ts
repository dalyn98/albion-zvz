export const DEMO_JOURNEY_STAGES = [
  'event_open',
  'signed_up',
  'attendance_confirmed',
  'regear_requested',
  'regear_approved',
  'gear_delivered',
  'completed',
] as const

export type DemoJourneyStage = (typeof DEMO_JOURNEY_STAGES)[number]

export const INITIAL_DEMO_JOURNEY_STAGE: DemoJourneyStage = 'event_open'

export function getDemoJourneyStageIndex(stage: DemoJourneyStage): number {
  return DEMO_JOURNEY_STAGES.indexOf(stage)
}

export function advanceDemoJourney(stage: DemoJourneyStage): DemoJourneyStage {
  const index = getDemoJourneyStageIndex(stage)
  return DEMO_JOURNEY_STAGES[Math.min(index + 1, DEMO_JOURNEY_STAGES.length - 1)]
}

export function isDemoJourneyComplete(stage: DemoJourneyStage): boolean {
  return stage === 'completed'
}
