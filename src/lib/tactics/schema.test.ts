import { describe, expect, it } from 'vitest'
import {
  MAX_TACTIC_BOARD_STATE_BYTES,
  MAX_TACTIC_OBJECTS,
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
