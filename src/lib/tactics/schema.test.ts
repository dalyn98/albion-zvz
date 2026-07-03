import { describe, expect, it } from 'vitest'
import {
  MAX_TACTIC_BOARD_STATE_BYTES,
  MAX_TACTIC_OBJECTS,
  cleanTacticGuidance,
  cleanTacticNextStepLinks,
  createDefaultPolygonPoints,
  createDefaultTacticBoardState,
  insertTacticPointAfter,
  moveTacticPoint,
  objectMatchesRoleFocus,
  objectTacticRole,
  removeTacticPoint,
  resizeTacticObjectFromPoint,
  reverseTacticPoints,
  tacticResizeHandlePoint,
  tacticPointCenter,
  tacticRoleColor,
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
          role: 'engageDps',
          x: 400,
          y: 420,
          size: 72,
          label: 'Main party',
          count: 20,
          visibleFor: ['all', 'engageDps'],
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

describe('tactic role colors', () => {
  it('keeps a stable palette for every role group', () => {
    expect(tacticRoleColor('tank')).toMatchObject({ fill: '#38bdf8', stroke: '#0ea5e9' })
    expect(tacticRoleColor('healer')).toMatchObject({ fill: '#4ade80', stroke: '#22c55e' })
    expect(tacticRoleColor('engageDps')).toMatchObject({ fill: '#fb7185', stroke: '#f43f5e' })
    expect(tacticRoleColor('support')).toMatchObject({ fill: '#c084fc', stroke: '#a855f7' })
    expect(tacticRoleColor('battleMount')).toMatchObject({ fill: '#67e8f9', stroke: '#06b6d4' })
    expect(tacticRoleColor('caller')).toMatchObject({ fill: '#facc15', stroke: '#eab308' })
    expect(tacticRoleColor('all')).toMatchObject({ fill: '#cbd5e1', stroke: '#94a3b8' })
  })

  it('derives object color role from unit role or role visibility target', () => {
    expect(
      objectTacticRole({
        id: 'tank',
        type: 'unitGroup',
        team: 'ally',
        role: 'tank',
        x: 100,
        y: 100,
        size: 64,
        label: 'Tank',
      }),
    ).toBe('tank')
    expect(
      objectTacticRole({
        id: 'healer-zone',
        type: 'zone',
        kind: 'safe',
        shape: 'circle',
        x: 100,
        y: 100,
        radius: 80,
        label: 'Healer safe',
        visibleFor: ['healer'],
      }),
    ).toBe('healer')
    expect(
      objectTacticRole({
        id: 'all-zone',
        type: 'zone',
        kind: 'clap',
        shape: 'circle',
        x: 100,
        y: 100,
        radius: 80,
        label: 'Clap',
      }),
    ).toBe('all')
  })

  it('normalizes legacy dps focus values to Engage DPS', () => {
    const result = validateTacticBoardState({
      version: 1,
      canvas: { width: 1600, height: 900, terrain: 'choke', gridSize: 50 },
      objects: [
        {
          id: 'legacy-main',
          type: 'unitGroup',
          team: 'ally',
          role: 'dps',
          x: 400,
          y: 420,
          size: 72,
          label: 'Legacy main',
          visibleFor: ['dps'],
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const object = result.state.objects[0]
      expect(object?.type).toBe('unitGroup')
      if (object?.type === 'unitGroup') expect(object.role).toBe('engageDps')
      expect(object?.visibleFor).toEqual(['engageDps'])
    }
  })
})

describe('tactic freeform shape editing', () => {
  it('moves, inserts, removes, reverses, and centers bounded tactic points', () => {
    const points = [
      [100, 100],
      [220, 100],
    ] as const

    expect(moveTacticPoint(points, 1, [2000, -20])).toEqual([
      [100, 100],
      [1600, 0],
    ])
    expect(insertTacticPointAfter(points, 0)).toEqual([
      [100, 100],
      [160, 100],
      [220, 100],
    ])
    expect(removeTacticPoint(points, 0, 2)).toEqual(points)
    expect(reverseTacticPoints(points)).toEqual([
      [220, 100],
      [100, 100],
    ])
    expect(tacticPointCenter([
      [100, 100],
      [300, 100],
      [300, 300],
      [100, 300],
    ])).toEqual([200, 200])
  })

  it('creates default polygon vertices around the object center', () => {
    expect(createDefaultPolygonPoints(800, 450)).toEqual([
      [680, 370],
      [920, 370],
      [960, 520],
      [720, 540],
    ])
  })

  it('validates ellipse and polygon zones with bounded vertices', () => {
    const result = validateTacticBoardState({
      version: 1,
      canvas: { width: 1600, height: 900, terrain: 'open-field', gridSize: 50 },
      objects: [
        {
          id: 'ellipse-zone',
          type: 'zone',
          kind: 'defensive',
          shape: 'ellipse',
          x: 500,
          y: 350,
          width: 320,
          height: 160,
          label: 'Healer spread',
        },
        {
          id: 'polygon-zone',
          type: 'zone',
          kind: 'clap',
          shape: 'polygon',
          x: 900,
          y: 430,
          points: [
            [-30, 80],
            [1700, 80],
            [900, 920],
          ],
          label: 'Odd choke',
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.objects[0]).toMatchObject({ type: 'zone', shape: 'ellipse' })
      expect(result.state.objects[1]).toMatchObject({
        type: 'zone',
        shape: 'polygon',
        points: [
          [0, 80],
          [1600, 80],
          [900, 900],
        ],
      })
    }
  })
})

describe('tactic drag resizing', () => {
  it('derives resize handle positions for resizable objects', () => {
    expect(
      tacticResizeHandlePoint({
        id: 'unit',
        type: 'unitGroup',
        team: 'ally',
        role: 'tank',
        x: 100,
        y: 120,
        size: 80,
        label: 'Tank',
      }),
    ).toEqual([140, 120])
    expect(
      tacticResizeHandlePoint({
        id: 'rect',
        type: 'zone',
        kind: 'defensive',
        shape: 'rectangle',
        x: 500,
        y: 400,
        width: 240,
        height: 120,
        label: 'Hold',
      }),
    ).toEqual([620, 460])
    expect(
      tacticResizeHandlePoint({
        id: 'poly',
        type: 'zone',
        kind: 'terrain',
        shape: 'polygon',
        x: 500,
        y: 400,
        points: createDefaultPolygonPoints(500, 400),
        label: 'Free',
      }),
    ).toBeNull()
  })

  it('resizes unit groups and radial zones from a dragged handle point', () => {
    expect(
      resizeTacticObjectFromPoint({
        id: 'unit',
        type: 'unitGroup',
        team: 'ally',
        role: 'tank',
        x: 100,
        y: 100,
        size: 64,
        label: 'Tank',
      }, [150, 100]),
    ).toMatchObject({ size: 100 })
    expect(
      resizeTacticObjectFromPoint({
        id: 'circle',
        type: 'zone',
        kind: 'danger',
        shape: 'circle',
        x: 300,
        y: 300,
        radius: 80,
        label: 'Bomb',
      }, [300, 900]),
    ).toMatchObject({ radius: 500 })
    expect(
      resizeTacticObjectFromPoint({
        id: 'cone',
        type: 'zone',
        kind: 'clap',
        shape: 'cone',
        x: 300,
        y: 300,
        radius: 120,
        angle: 90,
        label: 'Clap',
      }, [315, 300]),
    ).toMatchObject({ radius: 20, angle: 90 })
  })

  it('resizes rectangular and elliptical zones from a dragged corner', () => {
    expect(
      resizeTacticObjectFromPoint({
        id: 'rect',
        type: 'zone',
        kind: 'defensive',
        shape: 'rectangle',
        x: 500,
        y: 400,
        width: 240,
        height: 120,
        label: 'Hold',
      }, [700, 520]),
    ).toMatchObject({ width: 400, height: 240 })
    expect(
      resizeTacticObjectFromPoint({
        id: 'ellipse',
        type: 'zone',
        kind: 'safe',
        shape: 'ellipse',
        x: 500,
        y: 400,
        width: 240,
        height: 120,
        label: 'Spread',
      }, [2000, 390]),
    ).toMatchObject({ width: 800, height: 20 })
  })
})

describe('tactic step guidance cleaning', () => {
  it('keeps only the step intent and drops noisy timing or checklist fields', () => {
    const guidance = cleanTacticGuidance({
      intent: '적 engage를 받아낸 뒤 main이 살아 있으면 counter 각을 본다.',
      trigger: '적 탱커가 우리 main 안쪽으로 들어옴',
      callerSignal: 'Hold / defensives / look east',
      dangerSigns: [
        'healer line이 main과 끊김',
        'Engage DPS가 caller보다 앞에 있음',
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

    expect(guidance).toEqual({
      intent: '적 engage를 받아낸 뒤 main이 살아 있으면 counter 각을 본다.',
    })
    expect(guidance).not.toHaveProperty('trigger')
    expect(guidance).not.toHaveProperty('dangerSigns')
    expect(guidance).not.toHaveProperty('decisionBranches')
    expect(guidance).not.toHaveProperty('cooldownTimeline')
  })

  it('bounds malformed intent without restoring the previous checklist model', () => {
    const guidance = cleanTacticGuidance({
      phase: 'fixed-skill-timeline',
      intent: 'x'.repeat(300),
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

    expect(guidance).toEqual({ intent: 'x'.repeat(240) })
  })
})

describe('tactic next-step link cleaning', () => {
  it('stores branches as transitions to another step instead of inline responses', () => {
    const links = cleanTacticNextStepLinks([
      {
        id: 'deep-engage',
        label: '적이 깊게 들어오면',
        targetStepId: 'counter-step',
        action: 'counter engage 준비',
      },
      {
        id: 'reset',
        label: '힐러 라인이 끊기면',
        targetStepId: 'reset-step',
        fallback: 'clap 포기',
      },
      { id: 'bad', label: '', targetStepId: 'skip' },
      { id: 'bad-target', label: '타겟 없음', targetStepId: '' },
    ])

    expect(links).toEqual([
      {
        id: 'deep-engage',
        label: '적이 깊게 들어오면',
        targetStepId: 'counter-step',
      },
      {
        id: 'reset',
        label: '힐러 라인이 끊기면',
        targetStepId: 'reset-step',
      },
    ])
    expect(links[0]).not.toHaveProperty('action')
    expect(links[1]).not.toHaveProperty('fallback')
  })

  it('bounds next-step links for editor payload size', () => {
    const links = cleanTacticNextStepLinks(
      Array.from({ length: 12 }, (_, index) => ({
        id: `branch-${index}`,
        label: `branch-${index}-${'x'.repeat(200)}`,
        targetStepId: `step-${index}`,
      })),
    )

    expect(links).toHaveLength(6)
    expect(links[0]?.label).toHaveLength(120)
  })
})
