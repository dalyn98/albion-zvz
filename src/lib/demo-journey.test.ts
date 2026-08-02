import { describe, expect, it } from 'vitest'
import {
  DEMO_JOURNEY_STAGES,
  INITIAL_DEMO_JOURNEY_STAGE,
  advanceDemoJourney,
  getDemoJourneyStageIndex,
  isDemoJourneyComplete,
} from './demo-journey'

describe('demo journey', () => {
  it('advances through the representative event-to-pickup flow in order', () => {
    const visited = [INITIAL_DEMO_JOURNEY_STAGE]
    while (!isDemoJourneyComplete(visited.at(-1)!)) {
      visited.push(advanceDemoJourney(visited.at(-1)!))
    }

    expect(visited).toEqual(DEMO_JOURNEY_STAGES)
  })

  it('stays completed after the last action and exposes stable progress indexes', () => {
    expect(advanceDemoJourney('completed')).toBe('completed')
    expect(getDemoJourneyStageIndex('event_open')).toBe(0)
    expect(getDemoJourneyStageIndex('completed')).toBe(DEMO_JOURNEY_STAGES.length - 1)
  })
})
