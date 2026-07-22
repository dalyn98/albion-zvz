'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckSquare2, ChevronDown, ExternalLink, Settings2, UserPlus, Users, Video, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  addAllianceContentManualParticipation,
  confirmAllianceContentSession,
  excludeAllianceContentBattles,
  reviewAllianceContentVideo,
  updateAllianceContentPolicy,
} from '@/app/actions/alliance-content-compliance'
import {
  collectSelectedAllianceContentBattleRecordIds,
  getAllianceContentCandidateSelectionKey,
} from '@/lib/alliance-content-compliance'
import type { AllianceContentAdminDashboard } from '@/lib/alliance-content-compliance-data'

type ReviewedDecisionIntent =
  | { kind: 'exclude'; battleRecordIds: string[]; candidateCount: number }
  | { kind: 'video-reject'; submissionId: string; username: string }

export default function AllianceContentComplianceAdminPanel({
  dashboard,
}: {
  dashboard: AllianceContentAdminDashboard
}) {
  const t = useTranslations('allianceContent')
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)
  const [policy, setPolicy] = useState(dashboard.policy)
  const [selectedMembers, setSelectedMembers] = useState<Record<string, string>>({})
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<string[]>([])
  const [reviewIntent, setReviewIntent] = useState<ReviewedDecisionIntent | null>(null)
  const [reviewReason, setReviewReason] = useState('')

  const candidateKeys = dashboard.candidates.map((candidate) =>
    getAllianceContentCandidateSelectionKey(candidate.battleRecordIds),
  )
  const candidateKeySet = new Set(candidateKeys)
  const activeSelectedCandidateKeys = new Set(
    selectedCandidateKeys.filter((key) => candidateKeySet.has(key)),
  )
  const selectedBattleRecordIds = collectSelectedAllianceContentBattleRecordIds(
    dashboard.candidates,
    activeSelectedCandidateKeys,
  )
  const allCandidatesSelected = candidateKeys.length > 0
    && candidateKeys.every((key) => activeSelectedCandidateKeys.has(key))

  const run = (action: () => Promise<{ ok: boolean }>) => {
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      setNotice(result.ok ? t('saved') : t('requestFailed'))
      if (result.ok) router.refresh()
    })
  }

  const addParticipant = (sessionId: string, memberDiscordId: string) => {
    setNotice(null)
    startTransition(async () => {
      const result = await addAllianceContentManualParticipation({ sessionId, memberDiscordId })
      setNotice(result.ok ? t('manualParticipantAdded') : t('requestFailed'))
      if (result.ok) {
        setSelectedMembers((current) => ({ ...current, [sessionId]: '' }))
        router.refresh()
      }
    })
  }

  const toggleCandidate = (candidateKey: string) => {
    setSelectedCandidateKeys((current) => current.includes(candidateKey)
      ? current.filter((key) => key !== candidateKey)
      : [...current, candidateKey])
  }

  const toggleAllCandidates = () => {
    setSelectedCandidateKeys(allCandidatesSelected ? [] : candidateKeys)
  }

  const excludeSelectedCandidates = () => {
    if (selectedBattleRecordIds.length === 0) return
    const selectedCount = activeSelectedCandidateKeys.size
    setReviewReason('')
    setReviewIntent({
      kind: 'exclude',
      battleRecordIds: [...selectedBattleRecordIds],
      candidateCount: selectedCount,
    })
  }

  const commitReviewedDecision = () => {
    if (!reviewIntent) return
    const reason = reviewReason.trim()
    if (!reason) {
      setNotice(t('decisionReasonRequired'))
      return
    }
    const intent = reviewIntent
    setNotice(null)
    startTransition(async () => {
      const result = intent.kind === 'exclude'
        ? await excludeAllianceContentBattles(intent.battleRecordIds, reason)
        : await reviewAllianceContentVideo(intent.submissionId, 'reject', reason)
      setNotice(
        result.ok
          ? intent.kind === 'exclude'
            ? t('bulkExcluded', { count: intent.candidateCount })
            : t('saved')
          : t('requestFailed'),
      )
      if (result.ok) {
        if (intent.kind === 'exclude') setSelectedCandidateKeys([])
        setReviewIntent(null)
        setReviewReason('')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted" role="status">
          {notice}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 size={17} className="text-accent" />
          <h2 className="font-semibold text-foreground">{t('policyTitle')}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField
            label={t('sessionGap')}
            value={policy.sessionGapMinutes}
            min={15}
            max={240}
            onChange={(sessionGapMinutes) => setPolicy((current) => ({ ...current, sessionGapMinutes }))}
          />
          <NumberField
            label={t('weeklySessions')}
            value={policy.weeklyMinSessions}
            min={0}
            max={20}
            onChange={(weeklyMinSessions) => setPolicy((current) => ({ ...current, weeklyMinSessions }))}
          />
          <NumberField
            label={t('weeklyRate')}
            value={policy.weeklyMinParticipationRate}
            min={0}
            max={100}
            onChange={(weeklyMinParticipationRate) => setPolicy((current) => ({ ...current, weeklyMinParticipationRate }))}
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">{t('videoRule', { count: dashboard.policy.videoEverySessions, days: dashboard.policy.videoDueDays })}</p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => updateAllianceContentPolicy(policy))}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {t('savePolicy')}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-1 flex items-center gap-2">
          <Video size={17} className="text-accent" />
          <h2 className="font-semibold text-foreground">{t('candidateTitle')}</h2>
        </div>
        <p className="mb-4 text-sm text-muted">{t('candidateDescription')}</p>
        {dashboard.candidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{t('candidateEmpty')}</p>
        ) : (
          <div
            data-alliance-candidate-scroll
            role="region"
            aria-label={t('candidateTitle')}
            tabIndex={0}
            className="max-h-[min(70dvh,52rem)] space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-lg border border-border bg-background/95 p-3 shadow-card backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={toggleAllCandidates}
                  className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50"
                >
                  <CheckSquare2 size={16} aria-hidden="true" />
                  {t(allCandidatesSelected ? 'clearCandidateSelection' : 'selectAllCandidates')}
                </button>
                <span className="truncate text-sm tabular-nums text-muted">
                  {t('selectedCandidates', { count: activeSelectedCandidateKeys.size })}
                </span>
              </div>
              <button
                type="button"
                disabled={isPending || selectedBattleRecordIds.length === 0}
                onClick={excludeSelectedCandidates}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
              >
                <X size={16} aria-hidden="true" />
                {t('excludeSelectedCandidates')}
              </button>
            </div>
            {dashboard.candidates.map((candidate) => {
              const candidateKey = getAllianceContentCandidateSelectionKey(candidate.battleRecordIds)
              const isSelected = activeSelectedCandidateKeys.has(candidateKey)
              return (
                <article
                  key={candidateKey}
                  className={`rounded-lg border bg-background p-4 transition-colors ${isSelected
                    ? 'border-accent bg-accent/5'
                    : 'border-border'}`}
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <label className="mb-2 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md pr-3 text-sm font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isPending}
                          onChange={() => toggleCandidate(candidateKey)}
                          className="size-4 accent-[var(--color-accent)]"
                        />
                        {t('selectCandidate')}
                      </label>
                      <p className="font-medium text-foreground">{formatRange(candidate.startedAt, candidate.endedAt, locale)}</p>
                      <p className="mt-1 text-xs text-muted">
                        {t('candidateMeta', { battles: candidate.battleRecordIds.length, members: candidate.participantCount })}
                      </p>
                      {candidate.participants.length === 0 ? (
                        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-300">
                          {t('candidateParticipantsEmpty')}
                        </p>
                      ) : (
                        <details className="group mt-3 rounded-md bg-surface px-3">
                          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                            <span className="tabular-nums">
                              {t('candidateParticipantsToggle', { count: candidate.participants.length })}
                            </span>
                            <ChevronDown
                              aria-hidden="true"
                              size={16}
                              className="shrink-0 text-muted transition-transform group-open:rotate-180"
                            />
                          </summary>
                          <ul className="grid gap-2 border-t border-border py-3 sm:grid-cols-2">
                            {candidate.participants.map((participant) => (
                              <li
                                key={participant.discordId ?? `unlinked:${participant.albionNickname}`}
                                className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-xs text-foreground shadow-[inset_0_0_0_1px_var(--color-border)]"
                              >
                                <span className="min-w-0 truncate" title={formatCandidateParticipantName(participant)}>
                                  {formatCandidateParticipantName(participant)}
                                </span>
                                <span className={participant.isSiteLinked
                                  ? 'shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300'
                                  : 'shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted'}
                                >
                                  {t(participant.isSiteLinked
                                    ? 'candidateParticipantLinked'
                                    : 'candidateParticipantUnlinked')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => confirmAllianceContentSession(candidate.battleRecordIds))}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <Check size={15} /> {t('confirmSession')}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setReviewReason('')
                          setReviewIntent({
                            kind: 'exclude',
                            battleRecordIds: [...candidate.battleRecordIds],
                            candidateCount: 1,
                          })
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted disabled:opacity-50"
                      >
                        <X size={15} /> {t('exclude')}
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Users size={17} className="text-accent" />
          <h2 className="font-semibold text-foreground">{t('confirmedTitle')}</h2>
        </div>
        {dashboard.sessions.length === 0 ? (
          <p className="text-sm text-muted">{t('confirmedEmpty')}</p>
        ) : (
          <div className="divide-y divide-border">
            {dashboard.sessions.map((session) => {
              const selectedMember = selectedMembers[session.id] ?? ''
              const existingParticipantIds = new Set(session.participants.map((participant) => participant.discordId))
              const eligibleMembers = dashboard.activeMembers.filter(
                (member) => !existingParticipantIds.has(member.discordId),
              )
              return (
                <article key={session.id} className="py-4 text-sm">
                  <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                    <p className="font-medium text-foreground">{formatRange(session.startedAt, session.endedAt, locale)}</p>
                    <p className="text-xs text-muted">
                      {t('confirmedMeta', { battles: session.battleCount, participants: session.participantCount })}
                    </p>
                  </div>
                  {session.participants.length > 0 && (
                    <p className="mt-2 text-xs text-muted">
                      {t('sessionParticipants', { names: session.participants.map((participant) => participant.username).join(', ') })}
                    </p>
                  )}
                  {eligibleMembers.length === 0 ? (
                    <p className="mt-3 text-xs text-muted">{t('noEligibleParticipants')}</p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <select
                        value={selectedMember}
                        onChange={(event) => setSelectedMembers((current) => ({
                          ...current,
                          [session.id]: event.target.value,
                        }))}
                        aria-label={t('selectParticipant')}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      >
                        <option value="">{t('selectParticipant')}</option>
                        {eligibleMembers.map((member) => (
                          <option key={member.discordId} value={member.discordId}>{member.username}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={isPending || !selectedMember}
                        onClick={() => addParticipant(session.id, selectedMember)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                      >
                        <UserPlus size={15} /> {t('addParticipant')}
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
        <p className="mt-4 text-xs text-muted">{t('manualParticipantNote')}</p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Video size={17} className="text-accent" />
          <h2 className="font-semibold text-foreground">{t('reviewTitle')}</h2>
        </div>
        {dashboard.pendingSubmissions.length === 0 ? (
          <p className="text-sm text-muted">{t('reviewEmpty')}</p>
        ) : (
          <div className="space-y-3">
            {dashboard.pendingSubmissions.map((submission) => (
              <article key={submission.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{submission.username}</p>
                    <span className="mt-1 inline-flex rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                      {t(
                        submission.source === 'regear'
                          ? 'videoSourceRegear'
                          : 'videoSourceDirect',
                      )}
                    </span>
                    <p className="mt-1 text-xs text-muted">{t('dueAt', { date: formatDate(submission.dueAt, locale) })}</p>
                    <a
                      href={submission.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm text-accent hover:underline"
                    >
                      {t('openVideo')} <ExternalLink size={13} />
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => reviewAllianceContentVideo(submission.id, 'approve'))}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {t('approve')}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setReviewReason('')
                        setReviewIntent({
                          kind: 'video-reject',
                          submissionId: submission.id,
                          username: submission.username,
                        })
                      }}
                      className="rounded-lg border border-rose-500/50 px-3 py-2 text-sm font-medium text-rose-300 disabled:opacity-50"
                    >
                      {t('reject')}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {reviewIntent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="compliance-decision-review-title"
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-4 sm:items-center"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-rose-500/40 bg-background p-5 shadow-2xl">
            <div>
              <h2 id="compliance-decision-review-title" className="text-lg font-bold text-foreground">
                {t('decisionReviewTitle')}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {reviewIntent.kind === 'exclude'
                  ? t('decisionExcludeSummary', {
                      candidates: reviewIntent.candidateCount,
                      battles: reviewIntent.battleRecordIds.length,
                    })
                  : t('decisionRejectSummary', { username: reviewIntent.username })}
              </p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">{t('decisionReasonLabel')}</span>
              <textarea
                value={reviewReason}
                onChange={(event) => setReviewReason(event.target.value.slice(0, 500))}
                rows={4}
                maxLength={500}
                placeholder={t('decisionReasonPlaceholder')}
                className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-rose-500/70"
              />
              <span className="block text-right text-[10px] tabular-nums text-muted">{reviewReason.length} / 500</span>
            </label>
            {!reviewReason.trim() && (
              <p className="text-xs text-amber-300">{t('decisionReasonRequired')}</p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setReviewIntent(null)
                  setReviewReason('')
                }}
                disabled={isPending}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-muted hover:bg-surface disabled:opacity-50"
              >
                {t('decisionBack')}
              </button>
              <button
                type="button"
                onClick={commitReviewedDecision}
                disabled={isPending || !reviewReason.trim()}
                className="min-h-11 rounded-lg bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {isPending ? t('decisionSubmitting') : t('decisionConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatCandidateParticipantName(participant: {
  username: string | null
  albionNickname: string
}): string {
  if (!participant.username || participant.albionNickname === participant.username) {
    return participant.albionNickname
  }
  return `${participant.albionNickname} (${participant.username})`
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
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
      />
    </label>
  )
}

function formatRange(startedAt: string, endedAt: string, locale: string): string {
  return `${formatDate(startedAt, locale)} – ${formatDate(endedAt, locale)}`
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
