'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  ArrowRight,
  Circle,
  Copy,
  Eye,
  FilePlus2,
  FlipHorizontal,
  MousePointer2,
  Pentagon,
  Plus,
  RectangleHorizontal,
  Save,
  Share2,
  Shield,
  Spline,
  Trash2,
  Triangle,
  Type,
  Users,
} from 'lucide-react'
import {
  createTacticShareLink,
  createTacticStep,
  deleteTacticStep,
  publishTacticBoard,
  saveTacticStep,
  updateTacticBoard,
} from '@/app/actions/tactics'
import type { TacticBoardDocument, TacticStepRecord } from '@/lib/tactics/queries'
import {
  TACTIC_CANVAS_HEIGHT,
  TACTIC_CANVAS_WIDTH,
  TACTIC_ROLE_FOCUS_VALUES,
  TACTIC_ZONE_SHAPE_VALUES,
  createDefaultPolygonPoints,
  insertTacticPointAfter,
  moveTacticPoint,
  removeTacticPoint,
  reverseTacticPoints,
  tacticPointCenter,
  tacticRoleColor,
  type TacticArrowKind,
  type TacticBoardObject,
  type TacticBoardState,
  type TacticGuidance,
  type TacticNextStepLink,
  type TacticPoint,
  type TacticRoleFocus,
  type TacticTeam,
  type TacticZoneKind,
  type TacticZoneShape,
} from '@/lib/tactics/schema'
import { useReportDirty, useUnsavedChanges } from '@/components/UnsavedChangesProvider'
import TacticCanvas from './TacticCanvas'

interface TacticEditorProps {
  document: TacticBoardDocument
  canPublish: boolean
}

const ROLE_OPTIONS = TACTIC_ROLE_FOCUS_VALUES.filter(
  (role): role is Exclude<TacticRoleFocus, 'all'> => role !== 'all',
)

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function updateStepState(
  steps: readonly TacticStepRecord[],
  stepId: string,
  updater: (state: TacticBoardState) => TacticBoardState,
): TacticStepRecord[] {
  return steps.map((step) =>
    step.id === stepId ? { ...step, boardState: updater(step.boardState) } : step,
  )
}

function updateStepMeta(
  steps: readonly TacticStepRecord[],
  stepId: string,
  patch: Partial<
    Pick<
      TacticStepRecord,
      'title' | 'callout' | 'roleCallouts' | 'guidance' | 'nextStepLinks' | 'durationSeconds'
    >
  >,
): TacticStepRecord[] {
  return steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step))
}

function patchGuidance(guidance: TacticGuidance, patch: Partial<TacticGuidance>): TacticGuidance {
  return { ...guidance, ...patch }
}

export default function TacticEditor({ document, canPublish }: TacticEditorProps) {
  const t = useTranslations('tactics')
  const router = useRouter()
  const { clearAll } = useUnsavedChanges()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState(document.board.title)
  const [summary, setSummary] = useState(document.board.summary)
  const [steps, setSteps] = useState<TacticStepRecord[]>(document.steps)
  const [activeStepId, setActiveStepId] = useState(document.steps[0]?.id ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<TacticRoleFocus>('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [shareUrl, setShareUrl] = useState('')

  const activeStep = steps.find((step) => step.id === activeStepId) ?? steps[0]
  const selectedObject = activeStep?.boardState.objects.find((object) => object.id === selectedId) ?? null
  const dirtySnapshot = JSON.stringify({
    title,
    summary,
    steps: steps.map((step) => ({
      id: step.id,
      title: step.title,
      callout: step.callout,
      roleCallouts: step.roleCallouts,
      guidance: step.guidance,
      nextStepLinks: step.nextStepLinks,
      durationSeconds: step.durationSeconds,
      boardState: step.boardState,
    })),
  })
  const initialSnapshot = JSON.stringify({
    title: document.board.title,
    summary: document.board.summary,
    steps: document.steps.map((step) => ({
      id: step.id,
      title: step.title,
      callout: step.callout,
      roleCallouts: step.roleCallouts,
      guidance: step.guidance,
      nextStepLinks: step.nextStepLinks,
      durationSeconds: step.durationSeconds,
      boardState: step.boardState,
    })),
  })
  useReportDirty(`tactic-editor:${document.board.id}`, dirtySnapshot !== initialSnapshot)

  function updateCurrentState(updater: (state: TacticBoardState) => TacticBoardState) {
    if (!activeStep) return
    setSteps((current) => updateStepState(current, activeStep.id, updater))
  }

  function updateSelected(updater: (object: TacticBoardObject) => TacticBoardObject) {
    if (!selectedId) return
    updateCurrentState((state) => ({
      ...state,
      objects: state.objects.map((object) => (object.id === selectedId ? updater(object) : object)),
    }))
  }

  function addObject(object: TacticBoardObject) {
    updateCurrentState((state) => ({ ...state, objects: [...state.objects, object] }))
    setSelectedId(object.id)
  }

  function addZone(shape: TacticZoneShape) {
    const polygonPoints = shape === 'polygon' ? createDefaultPolygonPoints(800, 450) : undefined
    const [x, y] = polygonPoints ? tacticPointCenter(polygonPoints) : [800, 450]
    addObject({
      id: newId('zone'),
      type: 'zone',
      kind: 'danger',
      shape,
      x,
      y,
      width: shape === 'ellipse' ? 280 : 240,
      height: shape === 'ellipse' ? 150 : 140,
      radius: 120,
      angle: 90,
      points: polygonPoints,
      label: t('defaultZone'),
    })
  }

  function deleteSelected() {
    if (!selectedId) return
    updateCurrentState((state) => ({
      ...state,
      objects: state.objects.filter((object) => object.id !== selectedId),
    }))
    setSelectedId(null)
  }

  function saveCurrent() {
    if (!activeStep) return
    setError('')
    setMessage('')
    startTransition(async () => {
      const boardResult = await updateTacticBoard({
        boardId: document.board.id,
        title,
        summary,
      })
      if (boardResult.error) {
        setError(boardResult.error)
        return
      }
      const stepResult = await saveTacticStep({
        boardId: document.board.id,
        stepId: activeStep.id,
        title: activeStep.title,
        callout: activeStep.callout,
        roleCallouts: activeStep.roleCallouts,
        guidance: activeStep.guidance,
        nextStepLinks: activeStep.nextStepLinks,
        boardState: activeStep.boardState,
        durationSeconds: activeStep.durationSeconds,
      })
      if (stepResult.error) {
        setError(stepResult.error)
        return
      }
      setMessage(t('saved'))
      clearAll()
      router.refresh()
    })
  }

  function runStepAction(action: () => Promise<{ error?: string; id?: string }>) {
    setError('')
    setMessage('')
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage(t('saved'))
      router.refresh()
    })
  }

  function publish() {
    setError('')
    setMessage('')
    startTransition(async () => {
      const result = await publishTacticBoard(document.board.id)
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage(t('published'))
      router.refresh()
    })
  }

  function createShare() {
    setError('')
    setMessage('')
    startTransition(async () => {
      const result = await createTacticShareLink(document.board.id)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.url) {
        setShareUrl(result.url)
        await navigator.clipboard?.writeText(result.url).catch(() => undefined)
      }
      setMessage(t('shareCreated'))
      router.refresh()
    })
  }

  if (!activeStep) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-950 p-10 text-center text-sm text-gray-400">
        {t('emptySteps')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-gray-400">{t('titleLabel')}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
              maxLength={80}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-gray-400">{t('summaryLabel')}</span>
            <input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
              maxLength={300}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/tactics/${document.board.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-amber-400 hover:text-white"
          >
            <Eye size={15} />
            {t('viewer')}
          </a>
          <button
            type="button"
            onClick={saveCurrent}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-50"
          >
            <Save size={15} />
            {isPending ? t('saving') : t('save')}
          </button>
          {canPublish && (
            <>
              <button
                type="button"
                onClick={publish}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/50 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
              >
                <Shield size={15} />
                {t('publish')}
              </button>
              <button
                type="button"
                onClick={createShare}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/10 disabled:opacity-50"
              >
                <Share2 size={15} />
                {t('share')}
              </button>
            </>
          )}
        </div>
      </div>

      {(error || message || shareUrl) && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
          {error || message}
          {shareUrl && (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="ml-3 inline-flex items-center gap-1 font-semibold underline decoration-dotted"
            >
              <Copy size={13} />
              {t('copyShareLink')}
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
        <Toolbar
          onAddAlly={() =>
            addObject({
              id: newId('ally'),
              type: 'unitGroup',
              team: 'ally',
              role: 'dps',
              x: 520,
              y: 520,
              size: 72,
              count: 20,
              label: t('defaultAlly'),
            })
          }
          onAddEnemy={() =>
            addObject({
              id: newId('enemy'),
              type: 'unitGroup',
              team: 'enemy',
              role: 'dps',
              x: 980,
              y: 360,
              size: 72,
              count: 20,
              label: t('defaultEnemy'),
            })
          }
          onAddArrow={() =>
            addObject({
              id: newId('arrow'),
              type: 'arrow',
              kind: 'engage',
              points: [
                [520, 520],
                [780, 420],
              ],
              label: t('defaultArrow'),
            })
          }
          onAddZone={addZone}
          onAddText={() =>
            addObject({
              id: newId('text'),
              type: 'text',
              x: 800,
              y: 160,
              label: t('defaultText'),
            })
          }
        />

        <div className="space-y-3">
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-gray-800 bg-gray-950 p-1">
            {TACTIC_ROLE_FOCUS_VALUES.map((role) => (
              <RoleFocusButton
                key={role}
                role={role}
                active={focus === role}
                label={t(`role.${role}`)}
                onClick={() => setFocus(role)}
              />
            ))}
          </div>
          <TacticCanvas
            state={activeStep.boardState}
            focus={focus}
            selectedId={selectedId}
            editable
            onChange={(next) => updateCurrentState(() => next)}
            onSelect={setSelectedId}
          />
          <StepEditor
            step={activeStep}
            steps={steps}
            onChange={(patch) => setSteps((current) => updateStepMeta(current, activeStep.id, patch))}
          />
          <StepTimeline
            steps={steps}
            activeStepId={activeStep.id}
            onSelect={(id) => {
              setActiveStepId(id)
              setSelectedId(null)
            }}
            onNew={() => runStepAction(() => createTacticStep(document.board.id))}
            onDuplicate={() => runStepAction(() => createTacticStep(document.board.id, activeStep.id))}
            onDelete={() => runStepAction(() => deleteTacticStep(document.board.id, activeStep.id))}
            disabled={isPending}
          />
        </div>

        <Inspector
          object={selectedObject}
          onChange={updateSelected}
          onDelete={deleteSelected}
        />
      </div>
    </div>
  )
}

function RoleFocusButton({
  role,
  active,
  label,
  onClick,
}: {
  role: TacticRoleFocus
  active: boolean
  label: string
  onClick: () => void
}) {
  const color = tacticRoleColor(role)
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'bg-amber-500 text-gray-950'
          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full border"
          style={{ backgroundColor: color.fill, borderColor: color.stroke }}
        />
        {label}
      </span>
    </button>
  )
}

function Toolbar({
  onAddAlly,
  onAddEnemy,
  onAddArrow,
  onAddZone,
  onAddText,
}: {
  onAddAlly: () => void
  onAddEnemy: () => void
  onAddArrow: () => void
  onAddZone: (shape: TacticZoneShape) => void
  onAddText: () => void
}) {
  const t = useTranslations('tactics')
  const items = [
    { label: t('toolSelect'), icon: MousePointer2, onClick: () => undefined },
    { label: t('toolAlly'), icon: Users, onClick: onAddAlly },
    { label: t('toolEnemy'), icon: Shield, onClick: onAddEnemy },
    { label: t('toolArrow'), icon: ArrowRight, onClick: onAddArrow },
    { label: t('toolZoneCircle'), icon: Circle, onClick: () => onAddZone('circle') },
    {
      label: t('toolZoneRectangle'),
      icon: RectangleHorizontal,
      onClick: () => onAddZone('rectangle'),
    },
    { label: t('toolZoneCone'), icon: Triangle, onClick: () => onAddZone('cone') },
    { label: t('toolZoneEllipse'), icon: Spline, onClick: () => onAddZone('ellipse') },
    { label: t('toolZonePolygon'), icon: Pentagon, onClick: () => onAddZone('polygon') },
    { label: t('toolText'), icon: Type, onClick: onAddText },
  ]
  return (
    <aside className="space-y-2 rounded-xl border border-gray-800 bg-gray-950 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
        {t('tools')}
      </h2>
      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
        {items.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-left text-sm font-semibold text-gray-200 hover:border-amber-500/60 hover:text-white"
          >
            <Icon size={15} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}

function StepEditor({
  step,
  steps,
  onChange,
}: {
  step: TacticStepRecord
  steps: readonly TacticStepRecord[]
  onChange: (
    patch: Partial<
      Pick<
        TacticStepRecord,
        'title' | 'callout' | 'roleCallouts' | 'guidance' | 'nextStepLinks' | 'durationSeconds'
      >
    >,
  ) => void
}) {
  const t = useTranslations('tactics')
  const guidance = step.guidance

  function updateGuidance(patch: Partial<TacticGuidance>) {
    onChange({ guidance: patchGuidance(guidance, patch) })
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-950 p-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-400">{t('stepTitleLabel')}</span>
          <input
            value={step.title}
            onChange={(event) => onChange({ title: event.target.value })}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            maxLength={80}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-gray-400">{t('durationLabel')}</span>
          <input
            type="number"
            min={2}
            max={60}
            value={step.durationSeconds}
            onChange={(event) => onChange({ durationSeconds: Number(event.target.value) })}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-semibold text-gray-400">{t('calloutLabel')}</span>
          <textarea
            value={step.callout}
            onChange={(event) => onChange({ callout: event.target.value })}
            className="min-h-20 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            maxLength={500}
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-semibold text-gray-400">{t('intentLabel')}</span>
          <textarea
            value={guidance.intent}
            onChange={(event) => updateGuidance({ intent: event.target.value })}
            className="min-h-20 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
            maxLength={240}
          />
        </label>
      </div>

      <NextStepLinkEditor
        step={step}
        steps={steps}
        onChange={(nextStepLinks) => onChange({ nextStepLinks })}
      />
    </section>
  )
}

function NextStepLinkEditor({
  step,
  steps,
  onChange,
}: {
  step: TacticStepRecord
  steps: readonly TacticStepRecord[]
  onChange: (links: TacticNextStepLink[]) => void
}) {
  const t = useTranslations('tactics')
  const targetOptions = steps.filter((candidate) => candidate.id !== step.id)

  function updateLink(index: number, patch: Partial<TacticNextStepLink>) {
    onChange(step.nextStepLinks.map((link, i) => (i === index ? { ...link, ...patch } : link)))
  }

  function addLink() {
    const target = targetOptions[0]
    if (!target) return
    onChange([
      ...step.nextStepLinks,
      { id: newId('next'), label: '', targetStepId: target.id },
    ].slice(0, 6))
  }

  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-400">{t('nextStepLinksLabel')}</span>
        <button
          type="button"
          onClick={addLink}
          disabled={step.nextStepLinks.length >= 6 || targetOptions.length === 0}
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-40"
        >
          <Plus size={13} />
          {t('addNextStepLink')}
        </button>
      </div>
      {targetOptions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-800 px-3 py-2 text-xs text-gray-500">
          {t('nextStepUnavailable')}
        </p>
      ) : (
        <div className="space-y-2">
          {step.nextStepLinks.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-800 px-3 py-2 text-xs text-gray-500">
              {t('nextStepLinkEmpty')}
            </p>
          )}
          {step.nextStepLinks.map((link, index) => (
            <div
              key={link.id}
              className="grid gap-2 rounded-lg border border-gray-800 bg-gray-900/60 p-2 md:grid-cols-[minmax(0,1fr)_220px_auto]"
            >
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-500">
                  {t('nextStepConditionLabel')}
                </span>
                <input
                  value={link.label}
                  onChange={(event) => updateLink(index, { label: event.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white outline-none focus:border-amber-500"
                  maxLength={120}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-500">
                  {t('nextStepTargetLabel')}
                </span>
                <select
                  value={link.targetStepId}
                  onChange={(event) => updateLink(index, { targetStepId: event.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-sm text-white outline-none focus:border-amber-500"
                >
                  {targetOptions.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => onChange(step.nextStepLinks.filter((_, i) => i !== index))}
                className="mt-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-500/40 text-red-200 hover:bg-red-500/10"
                aria-label={t('removeNextStepLink')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StepTimeline({
  steps,
  activeStepId,
  onSelect,
  onNew,
  onDuplicate,
  onDelete,
  disabled,
}: {
  steps: readonly TacticStepRecord[]
  activeStepId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDuplicate: () => void
  onDelete: () => void
  disabled: boolean
}) {
  const t = useTranslations('tactics')
  return (
    <section className="space-y-2 rounded-xl border border-gray-800 bg-gray-950 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
          {t('timeline')}
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onNew}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            <Plus size={13} />
            {t('newStep')}
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            <FilePlus2 size={13} />
            {t('duplicateStep')}
          </button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(step.id)}
            className={`min-w-36 rounded-lg border px-3 py-2 text-left transition-colors ${
              activeStepId === step.id
                ? 'border-amber-500 bg-amber-500/10 text-amber-100'
                : 'border-gray-800 bg-gray-900 text-gray-300 hover:border-gray-600'
            }`}
          >
            <span className="block text-[11px] text-gray-500">
              {t('stepCounter', { current: index + 1, total: steps.length })}
            </span>
            <span className="block truncate text-sm font-semibold">{step.title}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled || steps.length <= 1}
        className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/10 disabled:opacity-40"
      >
        <Trash2 size={13} />
        {t('deleteStep')}
      </button>
    </section>
  )
}

function Inspector({
  object,
  onChange,
  onDelete,
}: {
  object: TacticBoardObject | null
  onChange: (updater: (object: TacticBoardObject) => TacticBoardObject) => void
  onDelete: () => void
}) {
  const t = useTranslations('tactics')
  if (!object) {
    return (
      <aside className="rounded-xl border border-gray-800 bg-gray-950 p-4 text-sm text-gray-500">
        {t('noSelection')}
      </aside>
    )
  }
  return (
    <aside className="space-y-3 rounded-xl border border-gray-800 bg-gray-950 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
          {t('inspector')}
        </h2>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/40 text-red-200 hover:bg-red-500/10"
          aria-label={t('deleteObject')}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-gray-400">{t('objectLabel')}</span>
        <input
          value={object.label}
          onChange={(event) => onChange((current) => ({ ...current, label: event.target.value }))}
          className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
          maxLength={80}
        />
      </label>
      <VisibleForEditor object={object} onChange={onChange} />
      {object.type !== 'arrow' && <PositionFields object={object} onChange={onChange} />}
      {object.type === 'unitGroup' && <UnitInspector object={object} onChange={onChange} />}
      {object.type === 'zone' && <ZoneInspector object={object} onChange={onChange} />}
      {object.type === 'arrow' && <ArrowInspector object={object} onChange={onChange} />}
    </aside>
  )
}

function VisibleForEditor({
  object,
  onChange,
}: {
  object: TacticBoardObject
  onChange: (updater: (object: TacticBoardObject) => TacticBoardObject) => void
}) {
  const t = useTranslations('tactics')
  const selected = new Set(object.visibleFor ?? [])
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-gray-400">{t('visibleFor')}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {TACTIC_ROLE_FOCUS_VALUES.map((role) => {
          const color = tacticRoleColor(role)
          return (
            <label key={role} className="flex items-center gap-1.5 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={selected.has(role)}
                onChange={(event) =>
                  onChange((current) => {
                    const next = new Set(current.visibleFor ?? [])
                    if (event.target.checked) next.add(role)
                    else next.delete(role)
                    return { ...current, visibleFor: [...next] }
                  })
                }
                className="rounded border-gray-600 bg-gray-900 text-amber-500"
              />
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full border"
                style={{ backgroundColor: color.fill, borderColor: color.stroke }}
              />
              <span>{t(`role.${role}`)}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function PositionFields({
  object,
  onChange,
}: {
  object: Extract<TacticBoardObject, { x: number; y: number }>
  onChange: (updater: (object: TacticBoardObject) => TacticBoardObject) => void
}) {
  const t = useTranslations('tactics')
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label={t('xLabel')}
        value={Math.round(object.x)}
        min={0}
        max={TACTIC_CANVAS_WIDTH}
        onChange={(value) =>
          onChange((current) => (current.type === 'arrow' ? current : { ...current, x: value }))
        }
      />
      <NumberField
        label={t('yLabel')}
        value={Math.round(object.y)}
        min={0}
        max={TACTIC_CANVAS_HEIGHT}
        onChange={(value) =>
          onChange((current) => (current.type === 'arrow' ? current : { ...current, y: value }))
        }
      />
    </div>
  )
}

function UnitInspector({
  object,
  onChange,
}: {
  object: Extract<TacticBoardObject, { type: 'unitGroup' }>
  onChange: (updater: (object: TacticBoardObject) => TacticBoardObject) => void
}) {
  const t = useTranslations('tactics')
  return (
    <>
      <SelectField
        label={t('teamLabel')}
        value={object.team}
        options={['ally', 'enemy', 'neutral'].map((team) => ({
          value: team,
          label: t(`team.${team}`),
        }))}
        onChange={(value) =>
          onChange((current) =>
            current.type === 'unitGroup' ? { ...current, team: value as TacticTeam } : current,
          )
        }
      />
      <SelectField
        label={t('roleLabel')}
        value={object.role}
        options={ROLE_OPTIONS.map((role) => ({ value: role, label: t(`role.${role}`) }))}
        onChange={(value) =>
          onChange((current) =>
            current.type === 'unitGroup'
              ? { ...current, role: value as Exclude<TacticRoleFocus, 'all'> }
              : current,
          )
        }
      />
      <NumberField
        label={t('sizeLabel')}
        value={object.size}
        min={20}
        max={180}
        onChange={(value) =>
          onChange((current) => (current.type === 'unitGroup' ? { ...current, size: value } : current))
        }
      />
      <NumberField
        label={t('countLabel')}
        value={object.count ?? 1}
        min={1}
        max={999}
        onChange={(value) =>
          onChange((current) => (current.type === 'unitGroup' ? { ...current, count: value } : current))
        }
      />
    </>
  )
}

function ZoneInspector({
  object,
  onChange,
}: {
  object: Extract<TacticBoardObject, { type: 'zone' }>
  onChange: (updater: (object: TacticBoardObject) => TacticBoardObject) => void
}) {
  const t = useTranslations('tactics')
  const sizedShape = object.shape === 'rectangle' || object.shape === 'ellipse'
  const polygonPoints = object.points ?? createDefaultPolygonPoints(object.x, object.y)

  function withPolygonPoints(
    zone: Extract<TacticBoardObject, { type: 'zone' }>,
    points: readonly TacticPoint[],
  ): TacticBoardObject {
    const [x, y] = tacticPointCenter(points)
    return {
      ...zone,
      x,
      y,
      points,
    }
  }

  return (
    <>
      <SelectField
        label={t('zoneKindLabel')}
        value={object.kind}
        options={['danger', 'safe', 'clap', 'defensive', 'terrain'].map((kind) => ({
          value: kind,
          label: t(`zoneKind.${kind}`),
        }))}
        onChange={(value) =>
          onChange((current) =>
            current.type === 'zone' ? { ...current, kind: value as TacticZoneKind } : current,
          )
        }
      />
      <SelectField
        label={t('shapeLabel')}
        value={object.shape}
        options={TACTIC_ZONE_SHAPE_VALUES.map((shape) => ({
          value: shape,
          label: t(`shape.${shape}`),
        }))}
        onChange={(value) =>
          onChange((current) =>
            current.type === 'zone'
              ? {
                  ...current,
                  shape: value as TacticZoneShape,
                  points:
                    value === 'polygon'
                      ? current.points ?? createDefaultPolygonPoints(current.x, current.y)
                      : undefined,
                }
              : current,
          )
        }
      />
      {object.shape !== 'rectangle' && object.shape !== 'ellipse' && object.shape !== 'polygon' && (
        <NumberField
          label={t('radiusLabel')}
          value={object.radius ?? 120}
          min={20}
          max={500}
          onChange={(value) =>
            onChange((current) =>
              current.type === 'zone' ? { ...current, radius: value } : current,
            )
          }
        />
      )}
      {sizedShape && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t('widthLabel')}
            value={object.width ?? 220}
            min={20}
            max={800}
            onChange={(value) =>
              onChange((current) =>
                current.type === 'zone' ? { ...current, width: value } : current,
              )
            }
          />
          <NumberField
            label={t('heightLabel')}
            value={object.height ?? 120}
            min={20}
            max={800}
            onChange={(value) =>
              onChange((current) =>
                current.type === 'zone' ? { ...current, height: value } : current,
              )
            }
          />
        </div>
      )}
      {object.shape === 'cone' && (
        <NumberField
          label={t('angleLabel')}
          value={object.angle ?? 90}
          min={15}
          max={180}
          onChange={(value) =>
            onChange((current) =>
              current.type === 'zone' ? { ...current, angle: value } : current,
            )
          }
        />
      )}
      {object.shape === 'polygon' && (
        <PointListEditor
          points={polygonPoints}
          minPoints={3}
          onMovePoint={(index, point) =>
            onChange((current) =>
              current.type === 'zone' && current.shape === 'polygon'
                ? withPolygonPoints(current, moveTacticPoint(current.points ?? polygonPoints, index, point))
                : current,
            )
          }
          onInsertAfter={(index) =>
            onChange((current) =>
              current.type === 'zone' && current.shape === 'polygon'
                ? withPolygonPoints(current, insertTacticPointAfter(current.points ?? polygonPoints, index))
                : current,
            )
          }
          onRemove={(index) =>
            onChange((current) =>
              current.type === 'zone' && current.shape === 'polygon'
                ? withPolygonPoints(current, removeTacticPoint(current.points ?? polygonPoints, index, 3))
                : current,
            )
          }
          onReverse={() =>
            onChange((current) =>
              current.type === 'zone' && current.shape === 'polygon'
                ? withPolygonPoints(current, reverseTacticPoints(current.points ?? polygonPoints))
                : current,
            )
          }
        />
      )}
    </>
  )
}

function ArrowInspector({
  object,
  onChange,
}: {
  object: Extract<TacticBoardObject, { type: 'arrow' }>
  onChange: (updater: (object: TacticBoardObject) => TacticBoardObject) => void
}) {
  const t = useTranslations('tactics')
  return (
    <>
      <SelectField
        label={t('arrowKindLabel')}
        value={object.kind}
        options={['engage', 'retreat', 'rotate', 'bait'].map((kind) => ({
          value: kind,
          label: t(`arrowKind.${kind}`),
        }))}
        onChange={(value) =>
          onChange((current) =>
            current.type === 'arrow' ? { ...current, kind: value as TacticArrowKind } : current,
          )
        }
      />
      <PointListEditor
        points={object.points}
        minPoints={2}
        onMovePoint={(index, point) =>
          onChange((current) =>
            current.type === 'arrow'
              ? { ...current, points: moveTacticPoint(current.points, index, point) }
              : current,
          )
        }
        onInsertAfter={(index) =>
          onChange((current) =>
            current.type === 'arrow'
              ? { ...current, points: insertTacticPointAfter(current.points, index) }
              : current,
          )
        }
        onRemove={(index) =>
          onChange((current) =>
            current.type === 'arrow'
              ? { ...current, points: removeTacticPoint(current.points, index, 2) }
              : current,
          )
        }
        onReverse={() =>
          onChange((current) =>
            current.type === 'arrow'
              ? { ...current, points: reverseTacticPoints(current.points) }
              : current,
          )
        }
      />
    </>
  )
}

function PointListEditor({
  points,
  minPoints,
  onMovePoint,
  onInsertAfter,
  onRemove,
  onReverse,
}: {
  points: readonly TacticPoint[]
  minPoints: number
  onMovePoint: (index: number, point: TacticPoint) => void
  onInsertAfter: (index: number) => void
  onRemove: (index: number) => void
  onReverse: () => void
}) {
  const t = useTranslations('tactics')
  return (
    <div className="space-y-2 border-t border-gray-800 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-400">{t('pointsLabel')}</span>
        <button
          type="button"
          onClick={onReverse}
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-800"
        >
          <FlipHorizontal size={13} />
          {t('reversePoints')}
        </button>
      </div>
      <div className="space-y-2">
        {points.map((point, index) => (
          <div
            key={`${point[0]}-${point[1]}-${index}`}
            className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-lg border border-gray-800 bg-gray-900/60 p-2"
          >
            <span className="pt-6 text-xs font-semibold text-gray-500">
              {t('pointIndexLabel', { number: index + 1 })}
            </span>
            <NumberField
              label={t('xLabel')}
              value={Math.round(point[0])}
              min={0}
              max={TACTIC_CANVAS_WIDTH}
              onChange={(value) => onMovePoint(index, [value, point[1]])}
            />
            <NumberField
              label={t('yLabel')}
              value={Math.round(point[1])}
              min={0}
              max={TACTIC_CANVAS_HEIGHT}
              onChange={(value) => onMovePoint(index, [point[0], value])}
            />
            <div className="col-span-3 flex justify-end gap-1">
              <button
                type="button"
                onClick={() => onInsertAfter(index)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 text-gray-200 hover:bg-gray-800"
                aria-label={t('addPoint')}
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                onClick={() => onRemove(index)}
                disabled={points.length <= minPoints}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/40 text-red-200 hover:bg-red-500/10 disabled:opacity-40"
                aria-label={t('removePoint')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-gray-400">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
      />
    </label>
  )
}
