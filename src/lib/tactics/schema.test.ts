import { describe, expect, it } from 'vitest'
import {
  MAX_TACTIC_BOARD_STATE_BYTES,
  MAX_TACTIC_OBJECTS,
  cleanTacticGuidance,
  createDefaultTacticBoardState,
  objectMatchesRoleFocus,
  validateTacticBoardState,
} from './schema'

describe('tactic board state validation', () => {
  it('accepts a compact valid ZvZ board state', () => {
    const result = validateTacticBoardState({
      version: 1,
      canvas: { width: 1600, height: 900, terrain: 'choke', gridSize: 50 },
      objects: [
        {
          id: 'ally-main',
          type: 'unitGroup',
          team: 'ally',
          role: 'dps',
          x: 400,
          y: 420,
          size: 72,
          label: 'Main party',
          count: 20,
          visibleFor: ['all', 'dps'],
        },
        {
          id: 'engage',
          type: 'arrow',
          kind: 'engage',
          points: [
            [430, 420],
            [700, 360],
          ],
          label: 'Engage path',
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.objects).toHaveLength(2)
      expect(result.state.objects[0]?.label).toBe('Main party')
    }
  })

  it('rejects oversized documents before they hit jsonb storage', () => {
    const hugeLabel = 'x'.repeat(MAX_TACTIC_BOARD_STATE_BYTES)
    const result = validateTacticBoardState({
      ...createDefaultTacticBoardState('open-field'),
      objects: [
        {
          id: 'huge',
          type: 'text',
          x: 100,
          y: 100,
          label: hugeLabel,
        },
      ],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('stateTooLarge')
  })

  it('rejects object spam beyond the bounded editor payload', () => {
    const base = createDefaultTacticBoardState('open-field')
    const result = validateTacticBoardState({
      ...base,
      objects: Array.from({ length: MAX_TACTIC_OBJECTS + 1 }, (_, index) => ({
        id: `unit-${index}`,
        type: 'unitGroup',
        team: 'ally',
        role: 'tank',
        x: 100,
        y: 100,
        size: 48,
        label: `Tank ${index}`,
      })),
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('tooManyObjects')
  })
})

describe('role focus filtering', () => {
  it('keeps all objects in the all focus and narrows role-specific objects', () => {
    const state = createDefaultTacticBoardState('open-field')
    const unit = {
      id: 'healer-anchor',
      type: 'unitGroup' as const,
      team: 'ally' as const,
      role: 'healer' as const,
      x: 200,
      y: 200,
      size: 64,
      label: 'Healer anchor',
      visibleFor: ['all', 'healer'] as const,
    }

    expect(objectMatchesRoleFocus(unit, 'all')).toBe(true)
    expect(objectMatchesRoleFocus(unit, 'healer')).toBe(true)
    expect(objectMatchesRoleFocus(unit, 'tank')).toBe(false)
    expect(objectMatchesRoleFocus(state.objects[0]!, 'tank')).toBe(true)
  })
})

describe('tactic step guidance cleaning', () => {
  it('keeps ZvZ guidance focused on conditional decisions instead of fixed skill timing', () => {
    const guidance = cleanTacticGuidance({
      phase: 'counter',
      intent: '적 engage를 받아낸 뒤 main이 살아 있으면 counter 각을 본다.',
      trigger: '적 탱커가 우리 main 안쪽으로 들어옴',
      callerSignal: 'Hold / defensives / look east',
      dangerSigns: [
        'healer line이 main과 끊김',
        'DPS가 caller보다 앞에 있음',
        '',
        'x'.repeat(300),
      ],
      commonMistakes: [
        '콜 전에 E 사용',
        '적 탱커를 따라 깊게 들어감',
      ],
      decisionBranches: [
        {
          condition: '우리 main이 뭉쳐 있고 적이 깊게 들어옴',
          action: 'counter engage 준비',
          fallback: 'caller 콜 없으면 hold',
        },
        {
          condition: 'healer/support가 뒤처짐',
          action: 'reset 방향으로 빠짐',
          fallback: 'clap 포기',
        },
      ],
      cooldownTimeline: [{ at: 3, action: 'offensive E' }],
    })

    expect(guidance.phase).toBe('counter')
    expect(guidance.intent).toContain('counter')
    expect(guidance.dangerSigns).toHaveLength(3)
    expect(guidance.dangerSigns[2]).toHaveLength(160)
    expect(guidance.commonMistakes).toEqual([
      '콜 전에 E 사용',
      '적 탱커를 따라 깊게 들어감',
    ])
    expect(guidance.decisionBranches).toHaveLength(2)
    expect(guidance.decisionBranches[0]).toEqual({
      condition: '우리 main이 뭉쳐 있고 적이 깊게 들어옴',
      action: 'counter engage 준비',
      fallback: 'caller 콜 없으면 hold',
    })
    expect(guidance).not.toHaveProperty('cooldownTimeline')
  })

  it('falls back to setup guidance and bounded arrays for malformed input', () => {
    const guidance = cleanTacticGuidance({
      phase: 'fixed-skill-timeline',
      intent: 123,
      trigger: null,
      callerSignal: {},
      dangerSigns: Array.from({ length: 20 }, (_, index) => `danger-${index}`),
      commonMistakes: 'do not parse strings as arrays',
      decisionBranches: [
        { condition: 'valid', action: 'act', fallback: 'fallback' },
        { condition: '', action: 'missing condition', fallback: 'skip' },
        { condition: 'missing action', action: '', fallback: 'skip' },
      ],
    })

    expect(guidance.phase).toBe('setup')
    expect(guidance.intent).toBe('')
    expect(guidance.trigger).toBe('')
    expect(guidance.callerSignal).toBe('')
    expect(guidance.dangerSigns).toHaveLength(8)
    expect(guidance.commonMistakes).toEqual([])
    expect(guidance.decisionBranches).toEqual([
      { condition: 'valid', action: 'act', fallback: 'fallback' },
    ])
  })
})
