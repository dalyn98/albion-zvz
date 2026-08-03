'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Link2,
  Loader2,
  Upload,
  Users,
  Video,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  submitAllianceContentVideo,
  submitMemberGameplayVideo,
} from '@/app/actions/alliance-content-compliance'
import type {
  MyAllianceContentCompliance,
  MyAllianceContentRequirement,
} from '@/lib/alliance-content-compliance-data'
import { MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH } from '@/lib/member-gameplay-video'
import {
  getYoutubeVideoProofId,
  youtubeVideoProofWatchUrl,
} from '@/lib/regear-video-proof'

type Notice = {
  text: string
  tone: 'success' | 'error'
}

export default function MyAllianceContentCompliancePanel({
  compliance,
}: {
  compliance: MyAllianceContentCompliance
}) {
  const t = useTranslations('allianceContent')
  const locale = useLocale()
  const router = useRouter()
  const videoUrlId = useId()
  const reflectionNoteId = useId()
  const [isPending, startTransition] = useTransition()
  const [videoUrl, setVideoUrl] = useState('')
  const [reflectionNote, setReflectionNote] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [actionNotice, setActionNotice] = useState<Notice | null>(null)

  const activeRequirement = compliance.requirements.find(
    (requirement) => requirement.status === 'open' && requirement.sessions.length > 0,
  ) ?? null
  const overdueRequirement = compliance.requirements.find(
    (requirement) => requirement.status === 'overdue',
  ) ?? null
  const recentVideoIsEligible = compliance.recentVideoUpload?.isExchangeEligible === true
  const needsRecentVideo =
    compliance.exchangeRecentGameplayVideoRequired && !recentVideoIsEligible
  const selectedSession = resolveSelectedSession(activeRequirement, selectedSessionId)
  const youtubeVideoId = getYoutubeVideoProofId(videoUrl)
  const videoWatchUrl = youtubeVideoId
    ? `https://www.youtube.com/watch?v=${youtubeVideoId}`
    : null
  const hasTypedInvalidUrl = videoUrl.trim().length > 0 && !youtubeVideoId
  const recentVideoCanBeReused = Boolean(
    activeRequirement &&
    recentVideoIsEligible &&
    compliance.recentVideoUpload &&
    !compliance.requirements.some(
      (requirement) =>
        requirement.submission?.videoUrl === compliance.recentVideoUpload?.videoUrl,
    ),
  )
  const hasAction = Boolean(activeRequirement || needsRecentVideo)
  const sessionTargetMet =
    compliance.weekSessionCount >= compliance.policy.weeklyMinSessions &&
    compliance.weekParticipationRate >= compliance.policy.weeklyMinParticipationRate
  const participationDaysTargetMet =
    compliance.weekParticipationDayCount >= compliance.policy.weeklyMinParticipationDays
  const participationTargetMet =
    (compliance.policy.sessionTargetEnabled && sessionTargetMet) ||
    (compliance.policy.participationDaysTargetEnabled && participationDaysTargetMet)

  const submitVideo = () => {
    if (!youtubeVideoId) {
      setActionNotice({ text: t('recentVideoInvalid'), tone: 'error' })
      return
    }
    if (activeRequirement && !selectedSession) {
      setActionNotice({ text: t('actionSessionInvalid'), tone: 'error' })
      return
    }

    setActionNotice(null)
    startTransition(async () => {
      const result = activeRequirement && selectedSession
        ? await submitAllianceContentVideo({
            requirementId: activeRequirement.id,
            sessionId: selectedSession,
            videoUrl,
          })
        : await submitMemberGameplayVideo({ videoUrl, reflectionNote })

      if (!result.ok) {
        setActionNotice({
          text: videoSubmissionErrorMessage(result.code, t),
          tone: 'error',
        })
        return
      }

      setVideoUrl('')
      setReflectionNote('')
      setSelectedSessionId('')
      setActionNotice({
        text: activeRequirement
          ? t(needsRecentVideo ? 'actionSuccessBoth' : 'actionSuccessDuty')
          : t('actionSuccessExchange'),
        tone: 'success',
      })
      router.refresh()
    })
  }

  const useRecentVideo = () => {
    const watchUrl = youtubeVideoProofWatchUrl(compliance.recentVideoUpload?.videoUrl)
    if (!watchUrl) return
    setVideoUrl(watchUrl)
    setActionNotice({ text: t('actionUsingRecent'), tone: 'success' })
  }

  return (
    <div className="space-y-6">
      <section
        id="video-submit"
        className="scroll-mt-24 rounded-2xl border border-accent/30 bg-accent/5 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-6"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-accent">
              <Video size={19} aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-[0.16em]">{t('actionEyebrow')}</p>
            </div>
            <h2 className="text-balance text-lg font-bold text-foreground sm:text-xl">
              {activeRequirement
                ? t('actionTitleRequired')
                : overdueRequirement && !needsRecentVideo
                  ? t('actionOverdueTitle')
                  : hasAction
                    ? t('actionTitleExchange')
                    : t('actionCompleteTitle')}
            </h2>
            <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted">
              {activeRequirement
                ? t(needsRecentVideo ? 'actionDescriptionBoth' : 'actionDescriptionDuty')
                : overdueRequirement && !needsRecentVideo
                  ? t('actionOverdueDescription')
                  : hasAction
                    ? t('actionDescriptionExchange', { days: 5 })
                    : t('actionCompleteDescription')}
            </p>
          </div>
          {!hasAction && !overdueRequirement && (
            <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 self-start rounded-full bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-200">
              <CheckCircle2 size={15} aria-hidden="true" /> {t('actionCompleteBadge')}
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ActionStatus
            label={t('actionDutyLabel')}
            value={
              activeRequirement
                ? t('actionDutyRequired', { date: formatDate(activeRequirement.dueAt, locale) })
                : overdueRequirement
                  ? t('actionDutyOverdue')
                  : t('actionDutyClear')
            }
            tone={activeRequirement || overdueRequirement ? 'warning' : 'success'}
          />
          <ActionStatus
            label={t('actionExchangeLabel')}
            value={
              !compliance.exchangeRecentGameplayVideoRequired
                ? t('actionExchangeNotRequired')
                : recentVideoIsEligible && compliance.recentVideoUpload
                  ? t('actionExchangeEligibleUntil', {
                      date: formatDate(compliance.recentVideoUpload.eligibleUntil, locale),
                    })
                  : t('actionExchangeRequired')
            }
            tone={
              !compliance.exchangeRecentGameplayVideoRequired || recentVideoIsEligible
                ? 'success'
                : 'warning'
            }
          />
        </div>

        {overdueRequirement && hasAction && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-100">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-pretty">{t('actionOverdueDescription')}</p>
          </div>
        )}

        {hasAction && (
          <form
            className="mt-5 space-y-4 rounded-xl border border-border bg-background/70 p-4 sm:p-5"
            onSubmit={(event) => {
              event.preventDefault()
              submitVideo()
            }}
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={videoUrlId} className="text-sm font-semibold text-foreground">
                  {t('actionVideoLabel')}
                </label>
                {recentVideoCanBeReused && (
                  <button
                    type="button"
                    onClick={useRecentVideo}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-accent transition-[background-color,scale] duration-150 hover:bg-accent/10 active:scale-[0.96]"
                  >
                    <Link2 size={14} aria-hidden="true" /> {t('actionUseRecent')}
                  </button>
                )}
              </div>
              <input
                id={videoUrlId}
                value={videoUrl}
                onChange={(event) => {
                  setVideoUrl(event.target.value)
                  setActionNotice(null)
                }}
                placeholder={t('youtubePlaceholder')}
                aria-invalid={hasTypedInvalidUrl}
                aria-describedby={`${videoUrlId}-hint`}
                className={`mt-1.5 min-h-11 w-full min-w-0 rounded-lg border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 focus:ring-2 focus:ring-accent/25 ${
                  hasTypedInvalidUrl ? 'border-rose-500/60' : 'border-border focus:border-accent/60'
                }`}
              />
              <p id={`${videoUrlId}-hint`} className="mt-1.5 text-pretty text-xs leading-5 text-muted">
                {t('actionYoutubeGuide')}
              </p>
              {hasTypedInvalidUrl && (
                <p className="mt-1 text-xs text-rose-300">{t('recentVideoInvalid')}</p>
              )}
            </div>

            {videoWatchUrl && (
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2 text-sm text-emerald-100">
                  <CheckCircle2 size={16} className="shrink-0 text-emerald-300" aria-hidden="true" />
                  <span className="truncate">{t('actionPreviewValid')}</span>
                </div>
                <a
                  href={videoWatchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-200 transition-[background-color,scale] duration-150 hover:bg-emerald-500/10 active:scale-[0.96]"
                >
                  {t('openVideo')} <ExternalLink size={13} aria-hidden="true" />
                </a>
              </div>
            )}

            {activeRequirement && (
              <div>
                <label htmlFor={`${videoUrlId}-session`} className="text-sm font-semibold text-foreground">
                  {t('selectSession')}
                </label>
                <select
                  id={`${videoUrlId}-session`}
                  value={selectedSession}
                  onChange={(event) => {
                    setSelectedSessionId(event.target.value)
                    setActionNotice(null)
                  }}
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/25"
                >
                  {activeRequirement.sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {formatDate(session.endedAt, locale)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!activeRequirement && needsRecentVideo && (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor={reflectionNoteId} className="text-sm font-semibold text-foreground">
                    {t('recentVideoReflectionLabel')}
                  </label>
                  <span className="text-[10px] tabular-nums text-muted">
                    {reflectionNote.length} / {MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH}
                  </span>
                </div>
                <textarea
                  id={reflectionNoteId}
                  rows={3}
                  maxLength={MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH}
                  value={reflectionNote}
                  onChange={(event) => setReflectionNote(event.target.value)}
                  placeholder={t('recentVideoReflectionPlaceholder')}
                  className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/25"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || !youtubeVideoId || Boolean(activeRequirement && !selectedSession)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent pl-4 pr-3.5 text-sm font-bold text-accent-foreground transition-[opacity,scale] duration-150 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isPending ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload size={16} aria-hidden="true" />
              )}
              {isPending
                ? t('actionSubmitting')
                : activeRequirement
                  ? t(needsRecentVideo ? 'actionSubmitBoth' : 'actionSubmitDuty')
                  : t('actionSubmitExchange')}
            </button>

            {actionNotice && (
              <p
                role="status"
                aria-live="polite"
                className={`rounded-xl border px-3 py-2 text-pretty text-sm ${
                  actionNotice.tone === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                {actionNotice.text}
              </p>
            )}
          </form>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-balance font-semibold text-foreground">{t('myWeeklyTitle')}</h2>
            <p className="mt-1 text-pretty text-sm text-muted">{t('myWeeklyDescription')}</p>
          </div>
          <span className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold ${
            participationTargetMet
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-rose-500/15 text-rose-300'
          }`}>
            <CheckCircle2 size={14} aria-hidden="true" />
            {t(participationTargetMet ? 'statsTargetMet' : 'statsTargetBelow')}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {compliance.policy.sessionTargetEnabled && (
            <>
              <Metric label={t('mySessions')} value={`${compliance.weekSessionCount}/${compliance.policy.weeklyMinSessions}`} />
              <Metric label={t('myRate')} value={`${compliance.weekParticipationRate}%`} />
              <Metric label={t('weekTotalSessions')} value={String(compliance.weekTotalSessions)} />
            </>
          )}
          {compliance.policy.participationDaysTargetEnabled && (
            <>
              <Metric
                label={t('myParticipationDays')}
                value={`${compliance.weekParticipationDayCount}/${compliance.policy.weeklyMinParticipationDays}`}
              />
              <Metric label={t('weekTotalActiveDays')} value={String(compliance.weekTotalActiveDays)} />
            </>
          )}
        </div>
        {compliance.policy.sessionTargetEnabled && compliance.policy.participationDaysTargetEnabled && (
          <p className="mt-3 text-pretty text-xs leading-5 text-muted">{t('myCriteriaOrHint')}</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-1 flex items-center gap-2">
          <Users size={18} className="text-accent" aria-hidden="true" />
          <h2 className="text-balance font-semibold text-foreground">{t('mySessionDetailsTitle')}</h2>
        </div>
        <p className="mb-4 text-pretty text-sm text-muted">{t('mySessionDetailsDescription')}</p>
        {compliance.confirmedSessions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{t('mySessionDetailsEmpty')}</p>
        ) : (
          <div
            data-alliance-member-session-scroll
            role="region"
            aria-label={t('mySessionDetailsTitle')}
            tabIndex={0}
            className="max-h-[min(65dvh,44rem)] space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {compliance.confirmedSessions.map((session) => (
              <article key={session.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <p className="font-medium text-foreground">{formatRange(session.startedAt, session.endedAt, locale)}</p>
                  <span className="text-xs tabular-nums text-muted">
                    {t('confirmedMeta', { battles: session.battleCount, participants: session.participantCount })}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {session.didParticipate ? t('myParticipationPresent') : t('myParticipationMissing')}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-1 flex items-center gap-2">
          <Video size={18} className="text-accent" aria-hidden="true" />
          <h2 className="text-balance font-semibold text-foreground">{t('myVideoTitle')}</h2>
        </div>
        <p className="mb-4 text-pretty text-sm text-muted">
          {t('videoRule', {
            count: compliance.policy.videoEverySessions,
            days: compliance.policy.videoDueDays,
          })}
        </p>

        {compliance.recentVideoUpload && (
          <div className="mb-4 rounded-xl border border-border bg-background p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-semibold text-foreground">{t('recentVideoTitle')}</p>
                <p className="mt-1 text-xs tabular-nums text-muted">
                  {t('recentVideoUploadedAt', {
                    date: formatDate(compliance.recentVideoUpload.uploadedAt, locale),
                  })}
                </p>
              </div>
              <a
                href={youtubeVideoProofWatchUrl(compliance.recentVideoUpload.videoUrl) ?? compliance.recentVideoUpload.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-accent transition-[background-color,scale] duration-150 hover:bg-accent/10 active:scale-[0.96]"
              >
                {t('openVideo')} <ExternalLink size={13} aria-hidden="true" />
              </a>
            </div>
            {compliance.recentVideoUpload.reflectionNote && (
              <p className="mt-2 text-pretty text-xs leading-relaxed text-muted">
                {t('recentVideoReflectionValue', {
                  note: compliance.recentVideoUpload.reflectionNote,
                })}
              </p>
            )}
          </div>
        )}

        {compliance.requirements.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{t('myVideoEmpty')}</p>
        ) : (
          <div
            data-alliance-requirement-scroll
            role="region"
            aria-label={t('myVideoTitle')}
            tabIndex={0}
            className="max-h-[min(65dvh,44rem)] space-y-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {compliance.requirements.map((requirement) => (
              <article key={requirement.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="font-medium text-foreground">{t(`status.${requirement.status}`)}</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs tabular-nums text-muted">
                      <Clock3 size={13} aria-hidden="true" />
                      {t('dueAt', { date: formatDate(requirement.dueAt, locale) })}
                    </p>
                  </div>
                  {requirement.submission && (
                    <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                      {t(`submissionStatus.${requirement.submission.status}`)}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-pretty text-xs text-muted">
                  {t('linkedSessions')}: {requirement.sessions.map((session) => formatDate(session.endedAt, locale)).join(', ')}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function resolveSelectedSession(
  requirement: MyAllianceContentRequirement | null,
  selectedSessionId: string,
): string {
  if (!requirement) return ''
  return requirement.sessions.some((session) => session.id === selectedSessionId)
    ? selectedSessionId
    : requirement.sessions[0]?.id ?? ''
}

function videoSubmissionErrorMessage(
  code: string,
  t: ReturnType<typeof useTranslations<'allianceContent'>>,
): string {
  switch (code) {
    case 'invalidVideo':
    case 'ALLIANCE_CONTENT_INVALID_VIDEO':
    case 'MEMBER_GAMEPLAY_VIDEO_INVALID_URL':
      return t('recentVideoInvalid')
    case 'ALLIANCE_CONTENT_VIDEO_ALREADY_USED':
    case 'MEMBER_GAMEPLAY_VIDEO_ALREADY_USED':
      return t('recentVideoAlreadyUsed')
    case 'ALLIANCE_CONTENT_VIDEO_DEADLINE_PASSED':
      return t('actionDeadlinePassed')
    case 'ALLIANCE_CONTENT_REQUIREMENT_NOT_FOUND':
      return t('actionRequirementMissing')
    case 'ALLIANCE_CONTENT_SESSION_NOT_IN_REQUIREMENT':
      return t('actionSessionInvalid')
    case 'MEMBER_GAMEPLAY_VIDEO_RATE_LIMITED':
      return t('recentVideoRateLimited')
    case 'MEMBER_GAMEPLAY_VIDEO_REFLECTION_TOO_LONG':
      return t('recentVideoReflectionTooLong', {
        max: MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH,
      })
    case 'ALLIANCE_CONTENT_FEATURE_UNAVAILABLE':
    case 'MEMBER_GAMEPLAY_VIDEO_FEATURE_UNAVAILABLE':
      return t('actionUnavailable')
    case 'unauthorized':
      return t('actionUnauthorized')
    default:
      return t('requestFailed')
  }
}

function ActionStatus({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'success' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3.5">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`mt-1 text-pretty text-sm font-semibold ${
        tone === 'success' ? 'text-emerald-300' : 'text-amber-200'
      }`}>
        {value}
      </p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatRange(startedAt: string, endedAt: string, locale: string): string {
  return `${formatDate(startedAt, locale)} – ${formatDate(endedAt, locale)}`
}
