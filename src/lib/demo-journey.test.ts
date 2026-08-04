import { describe, expect, it } from 'vitest'
import {
  DEMO_JOURNEY_STAGES,
  INITIAL_DEMO_JOURNEY_STATE,
  canRunDemoJourneyCommand,
  changeDemoJourneyActor,
  getDemoJourneyProjection,
  isDemoJourneyComplete,
  parseDemoJourneyState,
  runDemoJourneyCommand,
  type DemoJourneyActor,
  type DemoJourneyCommand,
  type DemoJourneyState,
} from './demo-journey'

const FLOW: ReadonlyArray<{
  actor: DemoJourneyActor
  command: DemoJourneyCommand
}> = [
  { actor: 'operator', command: 'publish_event' },
  { actor: 'member', command: 'sign_up' },
  { actor: 'operator', command: 'confirm_attendance' },
  { actor: 'operator', command: 'confirm_reward' },
  { actor: 'member', command: 'request_regear' },
  { actor: 'operator', command: 'approve_regear' },
  { actor: 'crafter', command: 'deliver_gear' },
  { actor: 'member', command: 'receive_gear' },
]

describe('demo journey', () => {
  it('completes the representative operator-to-member workflow in order', () => {
    const visited = [INITIAL_DEMO_JOURNEY_STATE.stage]
    let state = INITIAL_DEMO_JOURNEY_STATE

    for (const step of FLOW) {
      state = changeDemoJourneyActor(state, step.actor)
      expect(canRunDemoJourneyCommand(state, step.command)).toBe(true)
      state = runDemoJourneyCommand(state, step.command)
      visited.push(state.stage)
    }

    expect(visited).toEqual(DEMO_JOURNEY_STAGES)
    expect(isDemoJourneyComplete(state.stage)).toBe(true)
  })

  it('rejects commands from the wrong role or wrong stage', () => {
    const memberAtDraft = changeDemoJourneyActor(
      INITIAL_DEMO_JOURNEY_STATE,
      'member',
    )

    expect(runDemoJourneyCommand(memberAtDraft, 'publish_event')).toBe(memberAtDraft)
    expect(runDemoJourneyCommand(INITIAL_DEMO_JOURNEY_STATE, 'sign_up')).toBe(
      INITIAL_DEMO_JOURNEY_STATE,
    )
  })

  it('keeps participation rewards separate from regear eligibility and queues', () => {
    let state: DemoJourneyState = {
      ...INITIAL_DEMO_JOURNEY_STATE,
      stage: 'attendance_confirmed',
    }
    const beforeReward = getDemoJourneyProjection(state)
    expect(beforeReward.memberPoints).toBe(12_450)
    expect(beforeReward.regearStatus).toBe('unavailable')

    state = runDemoJourneyCommand(state, 'confirm_reward')
    const afterReward = getDemoJourneyProjection(state)
    expect(afterReward.memberPoints).toBe(12_750)
    expect(afterReward.regearStatus).toBe('requestable')
    expect(afterReward.approvalCount).toBe(0)

    state = changeDemoJourneyActor(state, 'member')
    state = runDemoJourneyCommand(state, 'request_regear')
    expect(getDemoJourneyProjection(state).approvalCount).toBe(1)
  })

  it('restores valid session state and rejects corrupt or obsolete payloads', () => {
    const persisted: DemoJourneyState = {
      version: 1,
      stage: 'regear_requested',
      actor: 'operator',
    }
    expect(parseDemoJourneyState(JSON.stringify(persisted))).toEqual(persisted)
    expect(parseDemoJourneyState('{bad json')).toEqual(INITIAL_DEMO_JOURNEY_STATE)
    expect(
      parseDemoJourneyState(JSON.stringify({ ...persisted, version: 0 })),
    ).toEqual(INITIAL_DEMO_JOURNEY_STATE)
  })
})
