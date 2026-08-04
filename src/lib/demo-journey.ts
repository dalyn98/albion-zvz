export const DEMO_JOURNEY_VERSION = 1 as const

export const DEMO_JOURNEY_STAGES = [
  'event_draft',
  'event_open',
  'signed_up',
  'attendance_confirmed',
  'reward_confirmed',
  'regear_requested',
  'regear_approved',
  'gear_delivered',
  'completed',
] as const

export const DEMO_JOURNEY_ACTORS = ['operator', 'member', 'crafter'] as const

export type DemoJourneyStage = (typeof DEMO_JOURNEY_STAGES)[number]
export type DemoJourneyActor = (typeof DEMO_JOURNEY_ACTORS)[number]

export type DemoJourneyCommand =
  | 'publish_event'
  | 'sign_up'
  | 'confirm_attendance'
  | 'confirm_reward'
  | 'request_regear'
  | 'approve_regear'
  | 'deliver_gear'
  | 'receive_gear'

export interface DemoJourneyState {
  version: typeof DEMO_JOURNEY_VERSION
  stage: DemoJourneyStage
  actor: DemoJourneyActor
}

interface DemoJourneyRule {
  command: DemoJourneyCommand
  actor: DemoJourneyActor
  next: DemoJourneyStage
}

const RULES: Record<Exclude<DemoJourneyStage, 'completed'>, DemoJourneyRule> = {
  event_draft: {
    command: 'publish_event',
    actor: 'operator',
    next: 'event_open',
  },
  event_open: {
    command: 'sign_up',
    actor: 'member',
    next: 'signed_up',
  },
  signed_up: {
    command: 'confirm_attendance',
    actor: 'operator',
    next: 'attendance_confirmed',
  },
  attendance_confirmed: {
    command: 'confirm_reward',
    actor: 'operator',
    next: 'reward_confirmed',
  },
  reward_confirmed: {
    command: 'request_regear',
    actor: 'member',
    next: 'regear_requested',
  },
  regear_requested: {
    command: 'approve_regear',
    actor: 'operator',
    next: 'regear_approved',
  },
  regear_approved: {
    command: 'deliver_gear',
    actor: 'crafter',
    next: 'gear_delivered',
  },
  gear_delivered: {
    command: 'receive_gear',
    actor: 'member',
    next: 'completed',
  },
}

export const INITIAL_DEMO_JOURNEY_STATE: DemoJourneyState = {
  version: DEMO_JOURNEY_VERSION,
  stage: 'event_draft',
  actor: 'operator',
}

export const INITIAL_DEMO_JOURNEY_STAGE: DemoJourneyStage =
  INITIAL_DEMO_JOURNEY_STATE.stage

export interface DemoJourneyProjection {
  progress: number
  expectedActor: DemoJourneyActor
  nextCommand: DemoJourneyCommand | null
  eventStatus: 'draft' | 'open' | 'closed'
  signedUp: boolean
  attendanceConfirmed: boolean
  participationRewardConfirmed: boolean
  memberPoints: number
  regearStatus:
    | 'unavailable'
    | 'requestable'
    | 'pending'
    | 'approved'
    | 'delivered'
    | 'received'
  approvalCount: number
  craftTaskCount: number
  pickupCount: number
}

const INITIAL_MEMBER_POINTS = 12_450
const PARTICIPATION_REWARD_POINTS = 300

export function getDemoJourneyStageIndex(stage: DemoJourneyStage): number {
  return DEMO_JOURNEY_STAGES.indexOf(stage)
}

function hasReached(stage: DemoJourneyStage, threshold: DemoJourneyStage): boolean {
  return getDemoJourneyStageIndex(stage) >= getDemoJourneyStageIndex(threshold)
}

export function getDemoJourneyRule(stage: DemoJourneyStage): DemoJourneyRule | null {
  return stage === 'completed' ? null : RULES[stage]
}

export function getDemoJourneyProjection(
  state: DemoJourneyState,
): DemoJourneyProjection {
  const stageIndex = getDemoJourneyStageIndex(state.stage)
  const rule = getDemoJourneyRule(state.stage)
  const signedUp = hasReached(state.stage, 'signed_up')
  const attendanceConfirmed = hasReached(state.stage, 'attendance_confirmed')
  const participationRewardConfirmed = hasReached(state.stage, 'reward_confirmed')

  let regearStatus: DemoJourneyProjection['regearStatus'] = 'unavailable'
  if (participationRewardConfirmed) regearStatus = 'requestable'
  if (hasReached(state.stage, 'regear_requested')) regearStatus = 'pending'
  if (hasReached(state.stage, 'regear_approved')) regearStatus = 'approved'
  if (hasReached(state.stage, 'gear_delivered')) regearStatus = 'delivered'
  if (state.stage === 'completed') regearStatus = 'received'

  return {
    progress: Math.round((stageIndex / (DEMO_JOURNEY_STAGES.length - 1)) * 100),
    expectedActor: rule?.actor ?? state.actor,
    nextCommand: rule?.command ?? null,
    eventStatus: hasReached(state.stage, 'attendance_confirmed')
      ? 'closed'
      : hasReached(state.stage, 'event_open')
        ? 'open'
        : 'draft',
    signedUp,
    attendanceConfirmed,
    participationRewardConfirmed,
    memberPoints:
      INITIAL_MEMBER_POINTS +
      (participationRewardConfirmed ? PARTICIPATION_REWARD_POINTS : 0),
    regearStatus,
    approvalCount: state.stage === 'regear_requested' ? 1 : 0,
    craftTaskCount: state.stage === 'regear_approved' ? 1 : 0,
    pickupCount: state.stage === 'gear_delivered' ? 1 : 0,
  }
}

export function canRunDemoJourneyCommand(
  state: DemoJourneyState,
  command: DemoJourneyCommand,
): boolean {
  const rule = getDemoJourneyRule(state.stage)
  return rule?.command === command && rule.actor === state.actor
}

export function runDemoJourneyCommand(
  state: DemoJourneyState,
  command: DemoJourneyCommand,
): DemoJourneyState {
  const rule = getDemoJourneyRule(state.stage)
  if (!rule || rule.command !== command || rule.actor !== state.actor) return state
  return { ...state, stage: rule.next }
}

export function changeDemoJourneyActor(
  state: DemoJourneyState,
  actor: DemoJourneyActor,
): DemoJourneyState {
  return state.actor === actor ? state : { ...state, actor }
}

export function advanceDemoJourney(stage: DemoJourneyStage): DemoJourneyStage {
  return getDemoJourneyRule(stage)?.next ?? 'completed'
}

export function isDemoJourneyComplete(stage: DemoJourneyStage): boolean {
  return stage === 'completed'
}

export function parseDemoJourneyState(raw: string | null): DemoJourneyState {
  if (!raw) return INITIAL_DEMO_JOURNEY_STATE
  try {
    const candidate = JSON.parse(raw) as Partial<DemoJourneyState>
    if (
      candidate.version === DEMO_JOURNEY_VERSION &&
      DEMO_JOURNEY_STAGES.includes(candidate.stage as DemoJourneyStage) &&
      DEMO_JOURNEY_ACTORS.includes(candidate.actor as DemoJourneyActor)
    ) {
      return candidate as DemoJourneyState
    }
  } catch {
    // Corrupt or legacy browser state falls back to the deterministic seed.
  }
  return INITIAL_DEMO_JOURNEY_STATE
}
