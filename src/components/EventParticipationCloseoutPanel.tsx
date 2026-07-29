'use client'

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Loader2,
  Plus,
  Search,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import {
  finalizeEventParticipationCloseout,
  type FinalizeEventParticipationEntryInput,
} from '@/app/actions/event-participation-closeout'
import type {
  EventParticipationCloseoutReceipt,
  EventParticipationCloseoutState,
} from '@/lib/event-participation-closeout-server'
import {
  EVENT_PARTICIPATION_REWARD_MAX,
  type EventParticipationCloseoutCandidate,
  type EventParticipationCloseoutSuggestion,
} from '@/lib/event-participation-closeout'
import { acquireBodyScrollLock } from '@/lib/body-scroll-lock'
import { formatSilver, parseSilverInput } from '@/lib/silver'
import { useToast } from '@/components/ToastProvider'
import MemberAvatar from '@/components/MemberAvatar'

interface Props {
  eventId: string
  state: EventParticipationCloseoutState
}

type ModalStep = 'edit' | 'confirm'

function contextPriority(
  suggestion: EventParticipationCloseoutSuggestion,
): number {
  if (suggestion.context === 'activity') return 0
  return 1
}

function compareStableText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function matchesSuggestion(
  suggestion: EventParticipationCloseoutSuggestion,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLocaleLowerCase()
  if (!query) return suggestion.context !== 'directory'
  return [
    suggestion.username,
    suggestion.discordId,
    suggestion.albionNickname ?? '',
    ...suggestion.possibleRoles,
  ].some((value) => value.toLocaleLowerCase().includes(query))
}

export default function EventParticipationCloseoutPanel({
  eventId,
  state,
}: Props) {
  const t = useTranslations('eventParticipationCloseout')
  const tCommon = useTranslations('common')
  const toast = useToast()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<ModalStep>('edit')
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [included, setIncluded] = useState<Record<string, boolean>>({})
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [manualIds, setManualIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [rewardInput, setRewardInput] = useState('0')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef(false)

  const suggestionById = useMemo(
    () => new Map(state.suggestions.map((row) => [row.discordId, row])),
    [state.suggestions],
  )
  const manualIdSet = useMemo(() => new Set(manualIds), [manualIds])
  const deferredSearch = useDeferredValue(search)
  const visibleSuggestions = useMemo(
    () =>
      state.suggestions
        .filter(
          (row) =>
            !manualIdSet.has(row.discordId) &&
            matchesSuggestion(row, deferredSearch),
        )
        .sort(
          (a, b) =>
            contextPriority(a) - contextPriority(b) ||
            b.activityBattleCount - a.activityBattleCount ||
            compareStableText(a.username, b.username),
        )
        .slice(0, 12),
    [deferredSearch, manualIdSet, state.suggestions],
  )
  const parsedReward = parseSilverInput(rewardInput)
  const rewardValid =
    parsedReward !== null &&
    Number.isInteger(parsedReward) &&
    parsedReward <= EVENT_PARTICIPATION_REWARD_MAX
  const includedCandidates = state.candidates.filter(
    (candidate) => included[candidate.discordId] !== false,
  )
  const participantCount = includedCandidates.length + manualIds.length
  const totalReward = rewardValid ? parsedReward * participantCount : 0

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const release = acquireBodyScrollLock()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!pendingRef.current) setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      const activeElement = document.activeElement
      const focusIsDialog = activeElement === dialogRef.current
      const focusIsOutside = !dialogRef.current.contains(activeElement)
      if (
        event.shiftKey &&
        (activeElement === first || focusIsDialog || focusIsOutside)
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (activeElement === last || focusIsDialog || focusIsOutside)
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      release()
      window.removeEventListener('keydown', onKey)
      queueMicrotask(() => {
        if (trigger?.isConnected) trigger.focus({ preventScroll: true })
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus({ preventScroll: true })
  }, [open, step])

  const openEditor = () => {
    setIncluded(
      Object.fromEntries(
        state.candidates.map((candidate) => [candidate.discordId, true]),
      ),
    )
    setDecisionNotes({})
    setManualIds([])
    setSearch('')
    setRewardInput('0')
    setMemo('')
    setError('')
    setStep('edit')
    setIdempotencyKey(crypto.randomUUID())
    setOpen(true)
  }

  const submit = () => {
    if (!rewardValid || !idempotencyKey) return
    const entries: FinalizeEventParticipationEntryInput[] = [
      ...state.candidates.map((candidate) => ({
        discordId: candidate.discordId,
        username: candidate.username,
        source: 'slot' as const,
        included: included[candidate.discordId] !== false,
        roleNames: candidate.roleNames,
        evidenceStatus: candidate.evidenceStatus,
        activityBattleCount: candidate.activityBattleCount,
        note: decisionNotes[candidate.discordId]?.trim() || null,
      })),
      ...manualIds.flatMap((discordId) => {
        const suggestion = suggestionById.get(discordId)
        if (!suggestion) return []
        return [
          {
            discordId: suggestion.discordId,
            username: suggestion.username,
            source: 'manual' as const,
            included: true,
            roleNames: suggestion.possibleRoles,
            evidenceStatus: suggestion.evidenceStatus,
            activityBattleCount: suggestion.activityBattleCount,
            note: null,
          },
        ]
      }),
    ]
    setError('')
    pendingRef.current = true
    startTransition(async () => {
      const result = await finalizeEventParticipationCloseout({
        eventId,
        idempotencyKey,
        rewardPerMember: parsedReward!,
        memo,
        entries,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      toast.success(t('toastFinalized'))
      router.refresh()
    })
  }

  if (state.receipt) {
    return <CloseoutReceipt receipt={state.receipt} />
  }

  const blocked = state.legacyPayoutStatus !== null

  return (
    <>
      <section className="rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-1.5 text-balance text-sm font-bold text-white">
              <ClipboardCheck size={15} className="text-indigo-300" />
              {t('title')}
            </h2>
            <p className="mt-1 text-pretty text-xs leading-relaxed text-gray-400">
              {t('description')}
            </p>
          </div>
          <button
            ref={triggerRef}
            type="button"
            onClick={openEditor}
            disabled={!state.canFinalizeNow || blocked}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-indigo-400/40 bg-indigo-500/15 px-3 py-2 text-xs font-bold text-indigo-100 transition-[background-color,scale] duration-150 ease-out hover:bg-indigo-500/25 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Users size={13} />
            {t('openButton')}
          </button>
        </div>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <SummaryChip
            label={t('assignedCandidates')}
            value={state.candidates.length}
          />
          <SummaryChip
            label={t('activityExceptions')}
            value={state.mismatchCount}
            warning={state.mismatchCount > 0}
          />
          <SummaryChip
            label={t('tentativeContext')}
            value={state.tentativeContextCount}
          />
        </dl>
        {!state.canFinalizeNow && (
          <p className="mt-3 rounded-lg border border-gray-700 bg-gray-950/50 px-3 py-2 text-xs text-gray-400">
            {t('notEnded')}
          </p>
        )}
        {state.legacyPayoutStatus && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {t(
              state.legacyPayoutStatus === 'pending'
                ? 'legacyPending'
                : 'legacyApproved',
            )}
          </p>
        )}
      </section>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false)
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="participation-closeout-title"
            aria-describedby="participation-closeout-subtitle"
            className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-indigo-500/30 bg-gray-900 sm:max-w-3xl sm:rounded-2xl"
          >
            <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-800 px-4 py-3">
              <div>
                <h3
                  id="participation-closeout-title"
                  className="flex items-center gap-2 text-balance font-bold text-white"
                >
                  <ClipboardCheck size={16} className="text-indigo-300" />
                  {t(step === 'edit' ? 'modalTitle' : 'confirmTitle')}
                </h3>
                <p
                  id="participation-closeout-subtitle"
                  className="mt-0.5 text-pretty text-[11px] text-gray-500"
                >
                  {t(step === 'edit' ? 'modalSubtitle' : 'confirmSubtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                disabled={pending}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-white active:scale-[0.96] disabled:opacity-40"
                aria-label={tCommon('close')}
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {step === 'edit' ? (
                <div className="space-y-5">
                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-bold text-gray-200">
                        {t('assignedSection')}
                      </h4>
                      <span className="tabular-nums text-[11px] text-gray-500">
                        {t('includedCount', {
                          count: includedCandidates.length,
                          total: state.candidates.length,
                        })}
                      </span>
                    </div>
                    {state.candidates.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-gray-700 px-3 py-4 text-center text-xs text-gray-500">
                        {t('noAssignedCandidates')}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {state.candidates.map((candidate) => (
                          <CandidateRow
                            key={candidate.discordId}
                            candidate={candidate}
                            checked={included[candidate.discordId] !== false}
                            note={decisionNotes[candidate.discordId] ?? ''}
                            onToggle={() =>
                              setIncluded((current) => ({
                                ...current,
                                [candidate.discordId]:
                                  current[candidate.discordId] === false,
                              }))
                            }
                            onNote={(note) =>
                              setDecisionNotes((current) => ({
                                ...current,
                                [candidate.discordId]: note,
                              }))
                            }
                          />
                        ))}
                      </ul>
                    )}
                  </section>

                  <section className="space-y-2 border-t border-gray-800 pt-4">
                    <div>
                      <h4 className="text-xs font-bold text-gray-200">
                        {t('manualSection')}
                      </h4>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {t('manualDescription')}
                      </p>
                    </div>
                    {manualIds.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {manualIds.map((discordId) => {
                          const suggestion = suggestionById.get(discordId)
                          if (!suggestion) return null
                          return (
                            <li
                              key={discordId}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 py-0.5 pl-2.5 pr-0.5 text-xs text-sky-100"
                            >
                              <UserPlus size={11} />
                              {suggestion.username}
                              <button
                                type="button"
                                onClick={() =>
                                  setManualIds((current) =>
                                    current.filter((id) => id !== discordId),
                                  )
                                }
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sky-200/70 transition-[background-color,color,scale] duration-150 hover:bg-sky-500/15 hover:text-white active:scale-[0.96]"
                                aria-label={t('removeManual', {
                                  name: suggestion.username,
                                })}
                              >
                                <X size={11} />
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <div className="relative">
                      <Search
                        size={13}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                      />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        aria-label={t('searchPlaceholder')}
                        placeholder={t('searchPlaceholder')}
                        className="min-h-10 w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-xs text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    {visibleSuggestions.length > 0 ? (
                      <ul className="grid gap-1.5 sm:grid-cols-2">
                        {visibleSuggestions.map((suggestion) => (
                          <SuggestionRow
                            key={suggestion.discordId}
                            suggestion={suggestion}
                            onAdd={() =>
                              setManualIds((current) => [
                                ...current,
                                suggestion.discordId,
                              ])
                            }
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-lg border border-dashed border-gray-800 px-3 py-3 text-center text-xs text-gray-600">
                        {t('noSuggestions')}
                      </p>
                    )}
                    {state.unresolvedActivity.length > 0 && (
                      <p className="flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        {t('unresolvedActivity', {
                          count: state.unresolvedActivity.length,
                        })}
                      </p>
                    )}
                  </section>

                  <section className="grid gap-3 border-t border-gray-800 pt-4 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-gray-400">
                        {t('rewardPerMember')}
                      </span>
                      <div className="relative">
                        <Coins
                          size={13}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400"
                        />
                        <input
                          value={rewardInput}
                          onChange={(event) =>
                            setRewardInput(event.target.value)
                          }
                          inputMode="numeric"
                          aria-invalid={!rewardValid}
                          aria-describedby="participation-closeout-reward-help"
                          className="min-h-10 w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 font-mono text-sm tabular-nums text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                      <span
                        id="participation-closeout-reward-help"
                        className={`block text-pretty text-[10px] ${
                          rewardValid ? 'text-gray-500' : 'text-rose-300'
                        }`}
                      >
                        {rewardValid
                          ? t('zeroRewardHint')
                          : t('invalidRewardHint', {
                              max: formatSilver(EVENT_PARTICIPATION_REWARD_MAX),
                            })}
                      </span>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] font-semibold text-gray-400">
                        {t('memo')}
                      </span>
                      <textarea
                        value={memo}
                        onChange={(event) => setMemo(event.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder={t('memoPlaceholder')}
                        className="min-h-10 w-full resize-none rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </label>
                  </section>
                </div>
              ) : (
                <ConfirmationSummary
                  assignedCount={state.candidates.length}
                  excludedCount={
                    state.candidates.length - includedCandidates.length
                  }
                  manualCount={manualIds.length}
                  participantCount={participantCount}
                  rewardPerMember={parsedReward ?? 0}
                  totalReward={totalReward}
                />
              )}

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-pretty text-xs text-rose-300"
                >
                  {error}
                </p>
              )}
            </div>

            <footer className="safe-area-bottom flex flex-shrink-0 items-center justify-between gap-2 border-t border-gray-800 px-4 py-3">
              <button
                type="button"
                onClick={() =>
                  step === 'confirm' ? setStep('edit') : setOpen(false)
                }
                disabled={pending}
                className="min-h-10 rounded-lg px-3 py-2 text-sm text-gray-400 transition-[color,scale] duration-150 hover:text-white active:scale-[0.96] disabled:opacity-50"
              >
                {step === 'confirm' ? t('backButton') : tCommon('cancel')}
              </button>
              {step === 'edit' ? (
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setStep('confirm')
                  }}
                  disabled={!rewardValid}
                  className="min-h-10 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-bold text-white transition-[background-color,scale] duration-150 hover:bg-indigo-400 active:scale-[0.96] disabled:opacity-50"
                >
                  {t('reviewButton')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || !rewardValid}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black transition-[background-color,scale] duration-150 hover:bg-emerald-400 active:scale-[0.96] disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2
                      size={14}
                      className="animate-spin motion-reduce:animate-none"
                    />
                  ) : (
                    <Check size={14} />
                  )}
                  {pending ? t('finalizing') : t('finalizeButton')}
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  )
}

function CandidateRow({
  candidate,
  checked,
  note,
  onToggle,
  onNote,
}: {
  candidate: EventParticipationCloseoutCandidate
  checked: boolean
  note: string
  onToggle: () => void
  onNote: (note: string) => void
}) {
  const t = useTranslations('eventParticipationCloseout')
  const mismatch = candidate.evidenceStatus === 'activity_not_found'
  return (
    <li
      className={`rounded-lg border px-3 py-2 ${
        mismatch
          ? 'border-amber-500/30 bg-amber-500/[0.06]'
          : 'border-gray-800 bg-gray-950/50'
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          onClick={onToggle}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-[background-color,scale] duration-150 hover:bg-white/5 active:scale-[0.96]"
          aria-label={t(checked ? 'excludeCandidate' : 'includeCandidate', {
            name: candidate.username,
          })}
        >
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 items-center justify-center rounded border ${
              checked
                ? 'border-emerald-400 bg-emerald-500 text-black'
                : 'border-rose-400/60 bg-rose-500/10 text-rose-300'
            }`}
          >
            {checked ? <Check size={12} /> : <UserMinus size={11} />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-100">
            {candidate.username}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-gray-500">
            {candidate.roleNames.length > 0
              ? candidate.roleNames.join(' · ')
              : t('noRole')}
          </p>
        </div>
        <EvidenceBadge
          status={candidate.evidenceStatus}
          count={candidate.activityBattleCount}
        />
      </div>
      {!checked && (
        <input
          value={note}
          onChange={(event) => onNote(event.target.value)}
          maxLength={500}
          placeholder={t('exclusionNotePlaceholder')}
          className="mt-2 min-h-10 w-full rounded-md border border-rose-500/20 bg-gray-950 px-2.5 py-1.5 text-[11px] text-white placeholder-gray-600 focus:border-rose-500/50 focus:outline-none"
        />
      )}
    </li>
  )
}

function SuggestionRow({
  suggestion,
  onAdd,
}: {
  suggestion: EventParticipationCloseoutSuggestion
  onAdd: () => void
}) {
  const t = useTranslations('eventParticipationCloseout')
  return (
    <li className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/50 px-2.5 py-2">
      <MemberAvatar
        discordId={suggestion.discordId}
        avatar={suggestion.avatar}
        size={22}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-gray-200">
          {suggestion.username}
        </p>
        <p className="truncate text-[10px] text-gray-500">
          {t(`context.${suggestion.context}`)}
          {suggestion.albionNickname ? ` · ${suggestion.albionNickname}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-200 transition-[background-color,scale] duration-150 hover:bg-sky-500/20 active:scale-[0.96]"
      >
        <Plus size={11} />
        {t('addManual')}
      </button>
    </li>
  )
}

function EvidenceBadge({
  status,
  count,
}: {
  status: EventParticipationCloseoutCandidate['evidenceStatus']
  count: number
}) {
  const t = useTranslations('eventParticipationCloseout')
  const warning = status === 'activity_not_found'
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold tabular-nums ${
        warning
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          : status === 'activity_confirmed'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
            : 'border-gray-700 bg-gray-800 text-gray-400'
      }`}
    >
      {t(`evidence.${status}`, { count })}
    </span>
  )
}

function ConfirmationSummary({
  assignedCount,
  excludedCount,
  manualCount,
  participantCount,
  rewardPerMember,
  totalReward,
}: {
  assignedCount: number
  excludedCount: number
  manualCount: number
  participantCount: number
  rewardPerMember: number
  totalReward: number
}) {
  const t = useTranslations('eventParticipationCloseout')
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
        <CheckCircle2 size={24} className="text-emerald-300" />
        <h4 className="mt-3 text-balance font-bold text-white">
          {t('confirmCheckTitle')}
        </h4>
        <p className="mt-1 text-pretty text-xs leading-relaxed text-gray-400">
          {t('confirmCheckDescription')}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryChip label={t('assignedCandidates')} value={assignedCount} />
        <SummaryChip
          label={t('excludedSlots')}
          value={excludedCount}
          warning={excludedCount > 0}
        />
        <SummaryChip label={t('manualParticipants')} value={manualCount} />
        <SummaryChip label={t('finalParticipants')} value={participantCount} />
        <SummaryChip
          label={t('rewardPerMember')}
          value={formatSilver(rewardPerMember)}
        />
        <SummaryChip
          label={t('totalReward')}
          value={formatSilver(totalReward)}
        />
      </dl>
      <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-pretty text-xs leading-relaxed text-amber-100">
        {t('irreversibleWarning')}
      </p>
    </div>
  )
}

function CloseoutReceipt({
  receipt,
}: {
  receipt: EventParticipationCloseoutReceipt
}) {
  const t = useTranslations('eventParticipationCloseout')
  const format = useFormatter()
  const included = receipt.entries.filter(
    (entry) => entry.decision === 'included',
  )
  const excluded = receipt.entries.filter(
    (entry) => entry.decision === 'excluded',
  )
  return (
    <section className="overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-500/15 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-balance text-sm font-bold text-white">
            <CheckCircle2 size={15} className="text-emerald-300" />
            {t('receiptTitle')}
          </h2>
          <p className="mt-1 text-pretty text-[11px] text-gray-400">
            {t('receiptMeta', {
              actor: receipt.finalizedByUsername,
              date: format.dateTime(new Date(receipt.finalizedAt), {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-200">
          {t('receiptFinalized')}
        </span>
      </header>
      <dl className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        <SummaryChip
          label={t('finalParticipants')}
          value={receipt.participantCount}
        />
        <SummaryChip
          label={t('excludedSlots')}
          value={receipt.excludedSlotCount}
        />
        <SummaryChip
          label={t('rewardPerMember')}
          value={formatSilver(receipt.rewardPerMember)}
        />
        <SummaryChip
          label={t('totalReward')}
          value={formatSilver(receipt.totalReward)}
        />
      </dl>
      <div className="border-t border-emerald-500/15 px-4 py-3">
        <h3 className="text-xs font-bold text-gray-200">
          {t('receiptRoster', { count: included.length })}
        </h3>
        {included.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {included.map((entry) => (
              <li
                key={entry.id}
                className="rounded-full border border-gray-700 bg-gray-950/60 px-2.5 py-1 text-xs text-gray-200"
              >
                {entry.username}
                {entry.source === 'manual' && (
                  <span className="ml-1 text-sky-300">
                    · {t('manualBadge')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-gray-500">{t('receiptEmpty')}</p>
        )}
        {excluded.length > 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500">
            <UserMinus size={12} />
            {t('receiptExcludedNames', {
              names: excluded.map((entry) => entry.username).join(', '),
            })}
          </p>
        )}
        {receipt.memo && (
          <p className="mt-3 rounded-lg bg-gray-950/50 px-3 py-2 text-xs text-gray-400">
            {receipt.memo}
          </p>
        )}
      </div>
    </section>
  )
}

function SummaryChip({
  label,
  value,
  warning = false,
}: {
  label: string
  value: string | number
  warning?: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd
        className={`mt-1 font-mono text-sm font-bold tabular-nums ${
          warning ? 'text-amber-300' : 'text-gray-100'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}
