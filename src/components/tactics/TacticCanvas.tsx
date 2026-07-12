'use client'

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslations } from 'next-intl'
import {
  TACTIC_CANVAS_HEIGHT,
  TACTIC_CANVAS_WIDTH,
  moveTacticPoint,
  objectMatchesRoleFocus,
  objectTacticRole,
  resizeTacticObjectFromPoint,
  tacticResizeHandlePoint,
  tacticPointCenter,
  tacticRoleColor,
  type TacticBoardObject,
  type TacticBoardState,
  type TacticPoint,
  type TacticRoleFocus,
} from '@/lib/tactics/schema'

interface TacticCanvasProps {
  state: TacticBoardState
  focus: TacticRoleFocus
  selectedId?: string | null
  editable?: boolean
  onChange?: (next: TacticBoardState) => void
  onSelect?: (id: string | null) => void
}

type DragState =
  | {
      mode: 'object'
      id: string
      startX: number
      startY: number
      object: TacticBoardObject
    }
  | {
      mode: 'point'
      id: string
      pointIndex: number
      objectType: 'arrow' | 'zone'
    }
  | {
      mode: 'resize'
      id: string
    }

interface PointDragTarget {
  id: string
  pointIndex: number
  objectType: 'arrow' | 'zone'
}

function teamStroke(object: TacticBoardObject): string {
  if (object.type !== 'unitGroup') return '#94a3b8'
  if (object.team === 'ally') return '#38bdf8'
  if (object.team === 'enemy') return '#fb7185'
  return '#a3e635'
}

function objectRoleColors(object: TacticBoardObject) {
  return tacticRoleColor(objectTacticRole(object))
}

function zoneFill(kind: string): string {
  if (kind === 'safe') return 'rgba(34,197,94,0.2)'
  if (kind === 'clap') return 'rgba(245,158,11,0.22)'
  if (kind === 'defensive') return 'rgba(59,130,246,0.2)'
  if (kind === 'terrain') return 'rgba(148,163,184,0.22)'
  return 'rgba(244,63,94,0.22)'
}

function zoneStroke(kind: string): string {
  if (kind === 'safe') return '#22c55e'
  if (kind === 'clap') return '#f59e0b'
  if (kind === 'defensive') return '#60a5fa'
  if (kind === 'terrain') return '#94a3b8'
  return '#fb7185'
}

function arrowStroke(kind: string): string {
  if (kind === 'retreat') return '#60a5fa'
  if (kind === 'rotate') return '#a78bfa'
  if (kind === 'bait') return '#f59e0b'
  return '#f97316'
}

function moveObject(object: TacticBoardObject, dx: number, dy: number): TacticBoardObject {
  if (object.type === 'arrow') {
    return {
      ...object,
      points: object.points.map(([x, y]) => [
        Math.max(0, Math.min(TACTIC_CANVAS_WIDTH, x + dx)),
        Math.max(0, Math.min(TACTIC_CANVAS_HEIGHT, y + dy)),
      ]),
    }
  }
  if (object.type === 'zone' && object.shape === 'polygon' && object.points) {
    const points = object.points.map(([x, y]) => [
      Math.max(0, Math.min(TACTIC_CANVAS_WIDTH, x + dx)),
      Math.max(0, Math.min(TACTIC_CANVAS_HEIGHT, y + dy)),
    ] as TacticPoint)
    const [x, y] = tacticPointCenter(points)
    return {
      ...object,
      x,
      y,
      points,
    }
  }
  return {
    ...object,
    x: Math.max(0, Math.min(TACTIC_CANVAS_WIDTH, object.x + dx)),
    y: Math.max(0, Math.min(TACTIC_CANVAS_HEIGHT, object.y + dy)),
  }
}

function conePath(x: number, y: number, radius: number, angle: number): string {
  const half = (angle / 2) * (Math.PI / 180)
  const left = [x + Math.cos(Math.PI - half) * radius, y + Math.sin(Math.PI - half) * radius]
  const right = [x + Math.cos(Math.PI + half) * radius, y + Math.sin(Math.PI + half) * radius]
  return `M ${x} ${y} L ${left[0]} ${left[1]} A ${radius} ${radius} 0 0 1 ${right[0]} ${right[1]} Z`
}

export default function TacticCanvas({
  state,
  focus,
  selectedId,
  editable = false,
  onChange,
  onSelect,
}: TacticCanvasProps) {
  const t = useTranslations('tactics')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const visibleObjects = useMemo(
    () => state.objects.filter((object) => objectMatchesRoleFocus(object, focus)),
    [state.objects, focus],
  )

  function pointFromEvent(event: PointerEvent<SVGElement>): TacticPoint {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return [0, 0]
    return [
      ((event.clientX - rect.left) / rect.width) * TACTIC_CANVAS_WIDTH,
      ((event.clientY - rect.top) / rect.height) * TACTIC_CANVAS_HEIGHT,
    ]
  }

  function startDrag(event: PointerEvent<SVGGElement>, object: TacticBoardObject) {
    event.stopPropagation()
    onSelect?.(object.id)
    event.currentTarget.ownerSVGElement?.focus()
    if (!editable) return
    const [x, y] = pointFromEvent(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ mode: 'object', id: object.id, startX: x, startY: y, object })
  }

  function startPointDrag(event: PointerEvent<SVGCircleElement>, target: PointDragTarget) {
    event.stopPropagation()
    onSelect?.(target.id)
    if (!editable) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ mode: 'point', ...target })
  }

  function startResizeDrag(event: PointerEvent<SVGRectElement>, object: TacticBoardObject) {
    event.stopPropagation()
    onSelect?.(object.id)
    if (!editable) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ mode: 'resize', id: object.id })
  }

  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    if (!editable || !drag || !onChange) return
    const [x, y] = pointFromEvent(event)
    if (drag.mode === 'resize') {
      onChange({
        ...state,
        objects: state.objects.map((object) =>
          object.id === drag.id ? resizeTacticObjectFromPoint(object, [x, y]) : object,
        ),
      })
      return
    }
    if (drag.mode === 'point') {
      onChange({
        ...state,
        objects: state.objects.map((object) => {
          if (object.id !== drag.id) return object
          if (drag.objectType === 'arrow' && object.type === 'arrow') {
            return {
              ...object,
              points: moveTacticPoint(object.points, drag.pointIndex, [x, y]),
            }
          }
          if (drag.objectType === 'zone' && object.type === 'zone' && object.shape === 'polygon') {
            const points = moveTacticPoint(object.points ?? [], drag.pointIndex, [x, y])
            const [centerX, centerY] = tacticPointCenter(points)
            return {
              ...object,
              x: centerX,
              y: centerY,
              points,
            }
          }
          return object
        }),
      })
      return
    }
    const dx = x - drag.startX
    const dy = y - drag.startY
    onChange({
      ...state,
      objects: state.objects.map((object) =>
        object.id === drag.id ? moveObject(drag.object, dx, dy) : object,
      ),
    })
  }

  function stopDrag() {
    setDrag(null)
  }

  function moveSelectedObject(event: KeyboardEvent<SVGSVGElement>) {
    if (!editable) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onSelect?.(null)
      return
    }
    if (!selectedId || !onChange) return
    const selectedObject = state.objects.find((object) => object.id === selectedId)
    if (!selectedObject) return

    const distance = event.shiftKey ? 40 : 12
    const movementByKey: Record<string, TacticPoint> = {
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
    }
    const movement = movementByKey[event.key]
    if (!movement) return

    event.preventDefault()
    onChange({
      ...state,
      objects: state.objects.map((object) =>
        object.id === selectedId ? moveObject(selectedObject, movement[0], movement[1]) : object,
      ),
    })
  }

  function selectObjectFromKeyboard(event: KeyboardEvent<SVGGElement>, object: TacticBoardObject) {
    if (!editable || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onSelect?.(object.id)
    event.currentTarget.ownerSVGElement?.focus()
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${TACTIC_CANVAS_WIDTH} ${TACTIC_CANVAS_HEIGHT}`}
      role={editable ? 'group' : 'img'}
      aria-label={editable ? t('canvasEditorLabel') : t('canvasReadOnlyLabel')}
      aria-describedby={editable ? 'tactic-canvas-editor-help' : undefined}
      tabIndex={editable ? 0 : undefined}
      className="block w-full rounded-lg border border-gray-700 bg-gray-950 shadow-inner"
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onPointerDown={() => onSelect?.(null)}
      onKeyDown={moveSelectedObject}
    >
      {editable && <desc id="tactic-canvas-editor-help">{t('canvasEditorDescription')}</desc>}
      <defs>
        <pattern id="tactic-grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="1" />
        </pattern>
        <marker id="tactic-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      <rect width={TACTIC_CANVAS_WIDTH} height={TACTIC_CANVAS_HEIGHT} fill="#0f172a" />
      <rect width={TACTIC_CANVAS_WIDTH} height={TACTIC_CANVAS_HEIGHT} fill="url(#tactic-grid)" />
      <TerrainOverlay terrain={state.canvas.terrain} />
      {visibleObjects.map((object) => (
        <g
          key={object.id}
          onPointerDown={(event) => startDrag(event, object)}
          onKeyDown={(event) => selectObjectFromKeyboard(event, object)}
          tabIndex={editable ? 0 : undefined}
          role={editable ? 'button' : undefined}
          aria-label={object.label || t('canvasUnnamedObject')}
          aria-pressed={editable ? selectedId === object.id : undefined}
          className={editable ? 'cursor-grab active:cursor-grabbing' : ''}
        >
          <RenderedObject
            object={object}
            selected={selectedId === object.id}
            editable={editable}
            onPointDragStart={startPointDrag}
            onResizeDragStart={startResizeDrag}
          />
        </g>
      ))}
    </svg>
  )
}

function TerrainOverlay({ terrain }: { terrain: string }) {
  if (terrain === 'choke') {
    return (
      <>
        <rect x="700" y="0" width="200" height="900" fill="rgba(15,23,42,0.7)" />
        <rect x="735" y="0" width="130" height="900" fill="rgba(71,85,105,0.22)" />
      </>
    )
  }
  if (terrain === 'bridge') {
    return (
      <>
        <rect x="0" y="330" width="1600" height="240" fill="rgba(14,165,233,0.16)" />
        <rect x="520" y="285" width="560" height="330" rx="18" fill="rgba(100,116,139,0.36)" />
      </>
    )
  }
  if (terrain === 'gate') {
    return (
      <>
        <rect x="610" y="0" width="380" height="310" fill="rgba(100,116,139,0.32)" />
        <rect x="720" y="235" width="160" height="160" fill="rgba(15,23,42,0.65)" />
      </>
    )
  }
  if (terrain === 'castle') {
    return (
      <rect x="460" y="170" width="680" height="560" rx="28" fill="rgba(100,116,139,0.24)" stroke="rgba(148,163,184,0.35)" strokeWidth="8" />
    )
  }
  if (terrain === 'territory') {
    return (
      <circle cx="800" cy="450" r="260" fill="rgba(34,197,94,0.1)" stroke="rgba(74,222,128,0.3)" strokeWidth="6" />
    )
  }
  return null
}

function PointHandles({
  id,
  objectType,
  points,
  onPointDragStart,
}: {
  id: string
  objectType: 'arrow' | 'zone'
  points: readonly TacticPoint[]
  onPointDragStart: (event: PointerEvent<SVGCircleElement>, target: PointDragTarget) => void
}) {
  return (
    <>
      {points.map(([x, y], pointIndex) => (
        <circle
          key={`${id}-${pointIndex}`}
          cx={x}
          cy={y}
          r="16"
          fill="#f8fafc"
          stroke="#facc15"
          strokeWidth="5"
          className="cursor-move"
          onPointerDown={(event) =>
            onPointDragStart(event, { id, objectType, pointIndex })
          }
        />
      ))}
    </>
  )
}

function ResizeHandle({
  object,
  onResizeDragStart,
}: {
  object: TacticBoardObject
  onResizeDragStart: (event: PointerEvent<SVGRectElement>, object: TacticBoardObject) => void
}) {
  const point = tacticResizeHandlePoint(object)
  if (!point) return null
  const [x, y] = point
  return (
    <rect
      x={x - 14}
      y={y - 14}
      width="28"
      height="28"
      rx="5"
      fill="#f8fafc"
      stroke="#facc15"
      strokeWidth="5"
      className="cursor-nwse-resize"
      onPointerDown={(event) => onResizeDragStart(event, object)}
    />
  )
}

function RenderedObject({
  object,
  selected,
  editable,
  onPointDragStart,
  onResizeDragStart,
}: {
  object: TacticBoardObject
  selected: boolean
  editable: boolean
  onPointDragStart: (event: PointerEvent<SVGCircleElement>, target: PointDragTarget) => void
  onResizeDragStart: (event: PointerEvent<SVGRectElement>, object: TacticBoardObject) => void
}) {
  if (object.type === 'unitGroup') {
    const colors = objectRoleColors(object)
    const stroke = selected ? '#facc15' : teamStroke(object)
    return (
      <>
        <circle
          cx={object.x}
          cy={object.y}
          r={object.size / 2}
          fill={colors.fill}
          fillOpacity="0.28"
          stroke={stroke}
          strokeWidth={selected ? 8 : 4}
        />
        <circle cx={object.x} cy={object.y} r={Math.max(14, object.size / 5)} fill={colors.fill} />
        <text x={object.x} y={object.y - object.size / 2 - 14} textAnchor="middle" className="fill-white text-[30px] font-bold">
          {object.label}
        </text>
        {object.count && (
          <text x={object.x} y={object.y + 9} textAnchor="middle" fill={colors.text} className="text-[26px] font-black">
            {object.count}
          </text>
        )}
        {selected && editable && (
          <ResizeHandle object={object} onResizeDragStart={onResizeDragStart} />
        )}
      </>
    )
  }

  if (object.type === 'arrow') {
    const points = object.points.map(([x, y]) => `${x},${y}`).join(' ')
    const role = objectTacticRole(object)
    const roleStroke = tacticRoleColor(role).stroke
    const stroke = role === 'all' ? arrowStroke(object.kind) : roleStroke
    const labelPoint = object.points[Math.floor(object.points.length / 2)] ?? object.points[0]
    return (
      <>
        <polyline
          points={points}
          fill="none"
          stroke={selected ? '#facc15' : stroke}
          strokeWidth={selected ? 12 : 8}
          strokeLinecap="round"
          strokeLinejoin="round"
          markerEnd="url(#tactic-arrow)"
          style={{ color: selected ? '#facc15' : stroke }}
        />
        {labelPoint && (
          <text x={labelPoint[0]} y={labelPoint[1] - 18} textAnchor="middle" className="fill-white text-[28px] font-bold">
            {object.label}
          </text>
        )}
        {selected && editable && (
          <PointHandles
            id={object.id}
            objectType="arrow"
            points={object.points}
            onPointDragStart={onPointDragStart}
          />
        )}
      </>
    )
  }

  if (object.type === 'zone') {
    const role = objectTacticRole(object)
    const colors = tacticRoleColor(role)
    const fill = role === 'all' ? zoneFill(object.kind) : colors.fill
    const stroke = selected ? '#facc15' : role === 'all' ? zoneStroke(object.kind) : colors.stroke
    return (
      <>
        {object.shape === 'rectangle' ? (
          <rect
            x={object.x - (object.width ?? 200) / 2}
            y={object.y - (object.height ?? 120) / 2}
            width={object.width ?? 200}
            height={object.height ?? 120}
            rx="18"
            fill={fill}
            fillOpacity={role === 'all' ? undefined : 0.2}
            stroke={stroke}
            strokeWidth={selected ? 8 : 4}
          />
        ) : object.shape === 'ellipse' ? (
          <ellipse
            cx={object.x}
            cy={object.y}
            rx={(object.width ?? 220) / 2}
            ry={(object.height ?? 120) / 2}
            fill={fill}
            fillOpacity={role === 'all' ? undefined : 0.2}
            stroke={stroke}
            strokeWidth={selected ? 8 : 4}
          />
        ) : object.shape === 'polygon' ? (
          <polygon
            points={(object.points ?? []).map(([x, y]) => `${x},${y}`).join(' ')}
            fill={fill}
            fillOpacity={role === 'all' ? undefined : 0.2}
            stroke={stroke}
            strokeWidth={selected ? 8 : 4}
            strokeLinejoin="round"
          />
        ) : object.shape === 'cone' ? (
          <path
            d={conePath(object.x, object.y, object.radius ?? 140, object.angle ?? 90)}
            fill={fill}
            fillOpacity={role === 'all' ? undefined : 0.2}
            stroke={stroke}
            strokeWidth={selected ? 8 : 4}
          />
        ) : (
          <circle
            cx={object.x}
            cy={object.y}
            r={object.radius ?? 100}
            fill={fill}
            fillOpacity={role === 'all' ? undefined : 0.2}
            stroke={stroke}
            strokeWidth={selected ? 8 : 4}
          />
        )}
        <text x={object.x} y={object.y + 8} textAnchor="middle" className="fill-white text-[28px] font-bold">
          {object.label}
        </text>
        {object.shape === 'polygon' && selected && editable && (
          <PointHandles
            id={object.id}
            objectType="zone"
            points={object.points ?? []}
            onPointDragStart={onPointDragStart}
          />
        )}
        {object.shape !== 'polygon' && selected && editable && (
          <ResizeHandle object={object} onResizeDragStart={onResizeDragStart} />
        )}
      </>
    )
  }

  return (
    <text
      x={object.x}
      y={object.y}
      textAnchor="middle"
      fill={objectTacticRole(object) === 'all' ? '#ffffff' : objectRoleColors(object).fill}
      stroke={selected ? '#facc15' : undefined}
      className="text-[32px] font-bold"
      strokeWidth={selected ? 1 : 0}
    >
      {object.label}
    </text>
  )
}
