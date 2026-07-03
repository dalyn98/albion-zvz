export const TACTIC_BOARD_VERSION = 1
export const TACTIC_CANVAS_WIDTH = 1600
export const TACTIC_CANVAS_HEIGHT = 900
export const MAX_TACTIC_OBJECTS = 300
export const MAX_TACTIC_STEPS = 30
export const MAX_TACTIC_BOARD_STATE_BYTES = 512 * 1024
export const MAX_TACTIC_TITLE_LENGTH = 80
export const MAX_TACTIC_SUMMARY_LENGTH = 300
export const MAX_TACTIC_CALLOUT_LENGTH = 500
export const MAX_TACTIC_LABEL_LENGTH = 80
export const MAX_TACTIC_GUIDANCE_TEXT_LENGTH = 240
export const MAX_TACTIC_NEXT_STEP_LABEL_LENGTH = 120
export const MAX_TACTIC_NEXT_STEP_LINKS = 6
export const MAX_TACTIC_POINTS = 12
export const MIN_TACTIC_UNIT_SIZE = 20
export const MAX_TACTIC_UNIT_SIZE = 180
export const MIN_TACTIC_ZONE_SIZE = 20
export const MAX_TACTIC_ZONE_SIZE = 800
export const MIN_TACTIC_ZONE_RADIUS = 20
export const MAX_TACTIC_ZONE_RADIUS = 500

export const TACTIC_ROLE_FOCUS_VALUES = [
  'all',
  'tank',
  'healer',
  'engageDps',
  'support',
  'battleMount',
  'caller',
] as const

export type TacticRoleFocus = (typeof TACTIC_ROLE_FOCUS_VALUES)[number]

export interface TacticRoleColor {
  fill: string
  stroke: string
  text: string
}

const TACTIC_ROLE_COLORS = {
  all: { fill: '#cbd5e1', stroke: '#94a3b8', text: '#0f172a' },
  tank: { fill: '#38bdf8', stroke: '#0ea5e9', text: '#082f49' },
  healer: { fill: '#4ade80', stroke: '#22c55e', text: '#052e16' },
  engageDps: { fill: '#fb7185', stroke: '#f43f5e', text: '#4c0519' },
  support: { fill: '#c084fc', stroke: '#a855f7', text: '#3b0764' },
  battleMount: { fill: '#67e8f9', stroke: '#06b6d4', text: '#083344' },
  caller: { fill: '#facc15', stroke: '#eab308', text: '#422006' },
} satisfies Record<TacticRoleFocus, TacticRoleColor>

export const TACTIC_TEAM_VALUES = ['ally', 'enemy', 'neutral'] as const
export type TacticTeam = (typeof TACTIC_TEAM_VALUES)[number]

export const TACTIC_TERRAIN_VALUES = [
  'open-field',
  'choke',
  'bridge',
  'gate',
  'castle',
  'territory',
] as const
export type TacticTerrain = (typeof TACTIC_TERRAIN_VALUES)[number]

export const TACTIC_BOARD_STATUS_VALUES = ['draft', 'published', 'archived'] as const
export type TacticBoardStatus = (typeof TACTIC_BOARD_STATUS_VALUES)[number]

export const TACTIC_VISIBILITY_VALUES = ['private', 'guild', 'share'] as const
export type TacticVisibility = (typeof TACTIC_VISIBILITY_VALUES)[number]

export type TacticObjectType = 'unitGroup' | 'arrow' | 'zone' | 'text'
export const TACTIC_ZONE_SHAPE_VALUES = [
  'circle',
  'rectangle',
  'cone',
  'ellipse',
  'polygon',
] as const
export type TacticZoneShape = (typeof TACTIC_ZONE_SHAPE_VALUES)[number]
export type TacticZoneKind = 'danger' | 'safe' | 'clap' | 'defensive' | 'terrain'
export type TacticArrowKind = 'engage' | 'retreat' | 'rotate' | 'bait'
export type TacticPoint = readonly [number, number]

export interface TacticCanvasState {
  width: number
  height: number
  terrain: TacticTerrain
  gridSize: number
}

interface BaseTacticObject {
  id: string
  type: TacticObjectType
  label: string
  visibleFor?: readonly TacticRoleFocus[]
}

export interface TacticUnitGroupObject extends BaseTacticObject {
  type: 'unitGroup'
  team: TacticTeam
  role: Exclude<TacticRoleFocus, 'all'>
  x: number
  y: number
  size: number
  count?: number
}

export interface TacticArrowObject extends BaseTacticObject {
  type: 'arrow'
  kind: TacticArrowKind
  points: readonly TacticPoint[]
}

export interface TacticZoneObject extends BaseTacticObject {
  type: 'zone'
  kind: TacticZoneKind
  shape: TacticZoneShape
  x: number
  y: number
  width?: number
  height?: number
  radius?: number
  angle?: number
  points?: readonly TacticPoint[]
}

export interface TacticTextObject extends BaseTacticObject {
  type: 'text'
  x: number
  y: number
}

export type TacticBoardObject =
  | TacticUnitGroupObject
  | TacticArrowObject
  | TacticZoneObject
  | TacticTextObject

export interface TacticBoardState {
  version: typeof TACTIC_BOARD_VERSION
  canvas: TacticCanvasState
  objects: readonly TacticBoardObject[]
}

export interface TacticGuidance {
  intent: string
}

export interface TacticNextStepLink {
  id: string
  label: string
  targetStepId: string
}

export type TacticValidationCode =
  | 'invalidState'
  | 'unsupportedVersion'
  | 'stateTooLarge'
  | 'tooManyObjects'
  | 'invalidObject'

export type TacticValidationResult =
  | { ok: true; state: TacticBoardState }
  | { ok: false; code: TacticValidationCode }

export interface TacticStepInput {
  title: string
  callout: string
  roleCallouts: Partial<Record<TacticRoleFocus, string>>
  guidance: TacticGuidance
  nextStepLinks: TacticNextStepLink[]
  boardState: TacticBoardState
  durationSeconds: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStringIn<const T extends readonly string[]>(
  value: unknown,
  values: T,
): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function safeId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(trimmed)) return fallback
  return trimmed
}

function normalizeTacticRoleFocus(value: unknown): TacticRoleFocus | null {
  if (value === 'dps') return 'engageDps'
  return isStringIn(value, TACTIC_ROLE_FOCUS_VALUES) ? value : null
}

function normalizeVisibleFor(value: unknown): readonly TacticRoleFocus[] | undefined {
  if (!Array.isArray(value)) return undefined
  const roles = value.flatMap((role) => {
    const normalized = normalizeTacticRoleFocus(role)
    return normalized ? [normalized] : []
  })
  return roles.length > 0 ? [...new Set(roles)] : undefined
}

function boundedTacticPoint(point: readonly [unknown, unknown]): TacticPoint {
  return [
    boundedNumber(point[0], 0, 0, TACTIC_CANVAS_WIDTH),
    boundedNumber(point[1], 0, 0, TACTIC_CANVAS_HEIGHT),
  ]
}

function normalizePoints(value: unknown, maxPoints = MAX_TACTIC_POINTS): readonly TacticPoint[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((point): point is [unknown, unknown] => Array.isArray(point) && point.length >= 2)
    .slice(0, maxPoints)
    .map(boundedTacticPoint)
}

export function moveTacticPoint(
  points: readonly TacticPoint[],
  index: number,
  nextPoint: TacticPoint,
): readonly TacticPoint[] {
  if (index < 0 || index >= points.length) return points
  return points.map((point, pointIndex) =>
    pointIndex === index ? boundedTacticPoint(nextPoint) : [...point],
  )
}

export function insertTacticPointAfter(
  points: readonly TacticPoint[],
  index: number,
  maxPoints = MAX_TACTIC_POINTS,
): readonly TacticPoint[] {
  if (points.length >= maxPoints || index < 0 || index >= points.length) return points
  const current = points[index]!
  const next = points[index + 1] ?? current
  const inserted = boundedTacticPoint([
    (current[0] + next[0]) / 2,
    (current[1] + next[1]) / 2,
  ])
  return [
    ...points.slice(0, index + 1).map((point) => [...point] as TacticPoint),
    inserted,
    ...points.slice(index + 1).map((point) => [...point] as TacticPoint),
  ]
}

export function removeTacticPoint(
  points: readonly TacticPoint[],
  index: number,
  minPoints: number,
): readonly TacticPoint[] {
  if (points.length <= minPoints || index < 0 || index >= points.length) return points
  return points.filter((_, pointIndex) => pointIndex !== index).map((point) => [...point])
}

export function reverseTacticPoints(points: readonly TacticPoint[]): readonly TacticPoint[] {
  return [...points].reverse().map((point) => [...point])
}

export function tacticPointCenter(points: readonly TacticPoint[]): TacticPoint {
  if (points.length === 0) return [TACTIC_CANVAS_WIDTH / 2, TACTIC_CANVAS_HEIGHT / 2]
  const total = points.reduce(
    (sum, point) => [sum[0] + point[0], sum[1] + point[1]] as TacticPoint,
    [0, 0] as TacticPoint,
  )
  return [Math.round(total[0] / points.length), Math.round(total[1] / points.length)]
}

export function createDefaultPolygonPoints(x: number, y: number): readonly TacticPoint[] {
  return [
    boundedTacticPoint([x - 120, y - 80]),
    boundedTacticPoint([x + 120, y - 80]),
    boundedTacticPoint([x + 160, y + 70]),
    boundedTacticPoint([x - 80, y + 90]),
  ]
}

function pointDistance([fromX, fromY]: TacticPoint, [toX, toY]: TacticPoint): number {
  return Math.hypot(toX - fromX, toY - fromY)
}

export function tacticResizeHandlePoint(object: TacticBoardObject): TacticPoint | null {
  if (object.type === 'unitGroup') {
    return boundedTacticPoint([object.x + object.size / 2, object.y])
  }
  if (object.type !== 'zone') return null
  if (object.shape === 'polygon') return null
  if (object.shape === 'rectangle' || object.shape === 'ellipse') {
    return boundedTacticPoint([
      object.x + (object.width ?? 220) / 2,
      object.y + (object.height ?? 120) / 2,
    ])
  }
  return boundedTacticPoint([object.x + (object.radius ?? 110), object.y])
}

export function resizeTacticObjectFromPoint(
  object: TacticBoardObject,
  point: TacticPoint,
): TacticBoardObject {
  if (object.type === 'unitGroup') {
    return {
      ...object,
      size: boundedNumber(
        pointDistance([object.x, object.y], point) * 2,
        object.size,
        MIN_TACTIC_UNIT_SIZE,
        MAX_TACTIC_UNIT_SIZE,
      ),
    }
  }
  if (object.type !== 'zone' || object.shape === 'polygon') return object
  if (object.shape === 'rectangle' || object.shape === 'ellipse') {
    return {
      ...object,
      width: boundedNumber(
        Math.abs(point[0] - object.x) * 2,
        object.width ?? 220,
        MIN_TACTIC_ZONE_SIZE,
        MAX_TACTIC_ZONE_SIZE,
      ),
      height: boundedNumber(
        Math.abs(point[1] - object.y) * 2,
        object.height ?? 120,
        MIN_TACTIC_ZONE_SIZE,
        MAX_TACTIC_ZONE_SIZE,
      ),
    }
  }
  return {
    ...object,
    radius: boundedNumber(
      pointDistance([object.x, object.y], point),
      object.radius ?? 110,
      MIN_TACTIC_ZONE_RADIUS,
      MAX_TACTIC_ZONE_RADIUS,
    ),
  }
}

function normalizeObject(input: unknown, index: number): TacticBoardObject | null {
  if (!isRecord(input)) return null
  const type = input.type
  const base = {
    id: safeId(input.id, `object-${index}`),
    label: cleanText(input.label, MAX_TACTIC_LABEL_LENGTH),
    visibleFor: normalizeVisibleFor(input.visibleFor),
  }

  if (type === 'unitGroup') {
    const normalizedRole = normalizeTacticRoleFocus(input.role)
    const role = normalizedRole && normalizedRole !== 'all' ? normalizedRole : 'engageDps'
    return {
      ...base,
      type: 'unitGroup',
      team: isStringIn(input.team, TACTIC_TEAM_VALUES) ? input.team : 'ally',
      role,
      x: boundedNumber(input.x, TACTIC_CANVAS_WIDTH / 2, 0, TACTIC_CANVAS_WIDTH),
      y: boundedNumber(input.y, TACTIC_CANVAS_HEIGHT / 2, 0, TACTIC_CANVAS_HEIGHT),
      size: boundedNumber(input.size, 64, MIN_TACTIC_UNIT_SIZE, MAX_TACTIC_UNIT_SIZE),
      count:
        typeof input.count === 'number' && Number.isFinite(input.count)
          ? Math.max(1, Math.min(999, Math.trunc(input.count)))
          : undefined,
    }
  }

  if (type === 'arrow') {
    const points = normalizePoints(input.points)
    if (points.length < 2) return null
    return {
      ...base,
      type: 'arrow',
      kind: isStringIn(input.kind, ['engage', 'retreat', 'rotate', 'bait'] as const)
        ? input.kind
        : 'engage',
      points,
    }
  }

  if (type === 'zone') {
    const shape = isStringIn(input.shape, TACTIC_ZONE_SHAPE_VALUES)
      ? input.shape
      : 'circle'
    const x = boundedNumber(input.x, TACTIC_CANVAS_WIDTH / 2, 0, TACTIC_CANVAS_WIDTH)
    const y = boundedNumber(input.y, TACTIC_CANVAS_HEIGHT / 2, 0, TACTIC_CANVAS_HEIGHT)
    const points = normalizePoints(input.points)
    return {
      ...base,
      type: 'zone',
      kind: isStringIn(
        input.kind,
        ['danger', 'safe', 'clap', 'defensive', 'terrain'] as const,
      )
        ? input.kind
        : 'danger',
      shape,
      x,
      y,
      width: boundedNumber(input.width, 220, MIN_TACTIC_ZONE_SIZE, MAX_TACTIC_ZONE_SIZE),
      height: boundedNumber(input.height, 120, MIN_TACTIC_ZONE_SIZE, MAX_TACTIC_ZONE_SIZE),
      radius: boundedNumber(input.radius, 110, MIN_TACTIC_ZONE_RADIUS, MAX_TACTIC_ZONE_RADIUS),
      angle: boundedNumber(input.angle, 90, 15, 180),
      points: shape === 'polygon'
        ? points.length >= 3
          ? points
          : createDefaultPolygonPoints(x, y)
        : undefined,
    }
  }

  if (type === 'text') {
    return {
      ...base,
      type: 'text',
      x: boundedNumber(input.x, TACTIC_CANVAS_WIDTH / 2, 0, TACTIC_CANVAS_WIDTH),
      y: boundedNumber(input.y, TACTIC_CANVAS_HEIGHT / 2, 0, TACTIC_CANVAS_HEIGHT),
    }
  }

  return null
}

export function createDefaultTacticBoardState(terrain: TacticTerrain): TacticBoardState {
  return {
    version: TACTIC_BOARD_VERSION,
    canvas: {
      width: TACTIC_CANVAS_WIDTH,
      height: TACTIC_CANVAS_HEIGHT,
      terrain,
      gridSize: 50,
    },
    objects: [
      {
        id: 'ally-main-party',
        type: 'unitGroup',
        team: 'ally',
        role: 'engageDps',
        x: 520,
        y: 520,
        size: 82,
        count: 20,
        label: 'Main party',
      },
      {
        id: 'enemy-main-party',
        type: 'unitGroup',
        team: 'enemy',
        role: 'engageDps',
        x: 980,
        y: 360,
        size: 82,
        count: 20,
        label: 'Enemy main',
      },
      {
        id: 'danger-clap-zone',
        type: 'zone',
        kind: 'danger',
        shape: 'circle',
        x: 790,
        y: 430,
        radius: 120,
        label: 'Clap danger',
      },
      {
        id: 'engage-path',
        type: 'arrow',
        kind: 'engage',
        points: [
          [570, 500],
          [760, 440],
        ],
        label: 'Engage',
      },
    ],
  }
}

export function validateTacticBoardState(input: unknown): TacticValidationResult {
  if (!isRecord(input)) return { ok: false, code: 'invalidState' }
  if (new TextEncoder().encode(JSON.stringify(input)).length > MAX_TACTIC_BOARD_STATE_BYTES) {
    return { ok: false, code: 'stateTooLarge' }
  }
  if (input.version !== TACTIC_BOARD_VERSION) return { ok: false, code: 'unsupportedVersion' }
  if (!Array.isArray(input.objects)) return { ok: false, code: 'invalidState' }
  if (input.objects.length > MAX_TACTIC_OBJECTS) return { ok: false, code: 'tooManyObjects' }

  const canvasInput = isRecord(input.canvas) ? input.canvas : {}
  const canvas: TacticCanvasState = {
    width: TACTIC_CANVAS_WIDTH,
    height: TACTIC_CANVAS_HEIGHT,
    terrain: isStringIn(canvasInput.terrain, TACTIC_TERRAIN_VALUES)
      ? canvasInput.terrain
      : 'open-field',
    gridSize: boundedNumber(canvasInput.gridSize, 50, 20, 100),
  }

  const objects = input.objects.map(normalizeObject).filter((obj): obj is TacticBoardObject => !!obj)
  if (objects.length !== input.objects.length) return { ok: false, code: 'invalidObject' }

  const state: TacticBoardState = {
    version: TACTIC_BOARD_VERSION,
    canvas,
    objects,
  }
  if (new TextEncoder().encode(JSON.stringify(state)).length > MAX_TACTIC_BOARD_STATE_BYTES) {
    return { ok: false, code: 'stateTooLarge' }
  }
  return { ok: true, state }
}

export function objectMatchesRoleFocus(
  object: TacticBoardObject,
  focus: TacticRoleFocus,
): boolean {
  if (focus === 'all') return true
  if (!object.visibleFor || object.visibleFor.length === 0) return true
  return object.visibleFor.includes(focus)
}

export function tacticRoleColor(role: TacticRoleFocus): TacticRoleColor {
  return TACTIC_ROLE_COLORS[role]
}

export function objectTacticRole(object: TacticBoardObject): TacticRoleFocus {
  if (object.type === 'unitGroup') return object.role
  return object.visibleFor?.find((role) => role !== 'all') ?? 'all'
}

export function cleanTacticTitle(value: unknown): string {
  return cleanText(value, MAX_TACTIC_TITLE_LENGTH)
}

export function cleanTacticSummary(value: unknown): string {
  return cleanText(value, MAX_TACTIC_SUMMARY_LENGTH)
}

export function cleanTacticCallout(value: unknown): string {
  return cleanText(value, MAX_TACTIC_CALLOUT_LENGTH)
}

export function cleanTacticRoleCallouts(
  value: unknown,
): Partial<Record<TacticRoleFocus, string>> {
  if (!isRecord(value)) return {}
  const entries = TACTIC_ROLE_FOCUS_VALUES
    .filter((role) => role !== 'all')
    .map((role) => {
      const legacyValue = role === 'engageDps' ? value.dps : undefined
      return [role, cleanTacticCallout(value[role] ?? legacyValue)] as const
    })
    .filter(([, callout]) => callout.length > 0)
  return Object.fromEntries(entries) as Partial<Record<TacticRoleFocus, string>>
}

export function createDefaultTacticGuidance(): TacticGuidance {
  return {
    intent: '',
  }
}

export function cleanTacticGuidance(value: unknown): TacticGuidance {
  if (!isRecord(value)) return createDefaultTacticGuidance()
  return {
    intent: cleanText(value.intent, MAX_TACTIC_GUIDANCE_TEXT_LENGTH),
  }
}

export function cleanTacticNextStepLinks(value: unknown): TacticNextStepLink[] {
  if (!Array.isArray(value)) return []
  return value
    .map((link, index): TacticNextStepLink | null => {
      if (!isRecord(link)) return null
      const label = cleanText(link.label, MAX_TACTIC_NEXT_STEP_LABEL_LENGTH)
      const targetStepId = safeId(link.targetStepId, '')
      if (!label || !targetStepId) return null
      return {
        id: safeId(link.id, `next-step-${index}`),
        label,
        targetStepId,
      }
    })
    .filter((link): link is TacticNextStepLink => !!link)
    .slice(0, MAX_TACTIC_NEXT_STEP_LINKS)
}

export function cleanTacticDuration(value: unknown): number {
  return Math.trunc(boundedNumber(value, 6, 2, 60))
}
