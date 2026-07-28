'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock3, ExternalLink, Upload, Users, Video } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  submitAllianceContentVideo,
  submitMemberGameplayVideo,
} from '@/app/actions/alliance-content-compliance'
import type { MyAllianceContentCompliance } from '@/lib/alliance-content-compliance-data'
import { MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH } from '@/lib/member-gameplay-video'
import { youtubeVideoProofWatchUrl } from '@/lib/regear-video-proof'

export default function MyAllianceContentCompliancePanel({
  compliance,
}: {
  compliance: MyAllianceContentCompliance
}) {
  const t = useTranslations('allianceContent')
  const locale = useLocale()
  const router = useRouter()
  const recentVideoUrlId = useId()
  const reflectionNoteId = useId()
  const [isPending, startTransition] = useTransition()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [recentVideoUrl, setRecentVideoUrl] = useState('')
  const [reflectionNote, setReflectionNote] = useState('')
  const [selectedSessions, setSelectedSessions] = useState<Record<string, string>>({})
  const [requirementNotice, setRequirementNotice] = useState<string | null>(null)
  const [recentVideoNotice, setRecentVideoNotice] = useState<{
    text: string
    tone: 'success' | 'error'
  } | null>(null)

  const submit = (requirementId: string, fallbackSessionId: string) => {
    const sessionId = selectedSessions[requirementId] ?? fallbackSessionId
    const videoUrl = urls[requirementId] ?? ''
    setRequirementNotice(null)
    startTransition(async () => {
      const result = await submitAllianceContentVideo({ requirementId, sessionId, videoUrl })
      setRequirementNotice(result.ok ? t('videoSubmitted') : t('requestFailed'))
      if (result.ok) router.refresh()
    })
  }

  const submitRecentVideo = () => {
    setRecentVideoNotice(null)
    startTransition(async () => {
      const result = await submitMemberGameplayVideo({
        videoUrl: recentVideoUrl,
        reflectionNote,
      })
      if (result.ok) {
        setRecentVideoUrl('')
        setReflectionNote('')
        setRecentVideoNotice({ text: t('recentVideoSubmitted'), tone: 'success' })
        router.refresh()
        return
      }
      setRecentVideoNotice({
        text: recentVideoErrorMessage(result.code, t),
        tone: 'error',
      })
    })
  }

  const recentVideoIsEligible = compliance.recentVideoUpload?.isExchangeEligible === true
  const sessionTargetMet =
    compliance.weekSessionCount >= compliance.policy.weeklyMinSessions &&
    compliance.weekParticipationRate >= compliance.policy.weeklyMinParticipationRate
  const participationDaysTargetMet =
    compliance.weekParticipationDayCount >= compliance.policy.weeklyMinParticipationDays
  const participationTargetMet =
    (compliance.policy.sessionTargetEnabled && sessionTargetMet) ||
    (compliance.policy.participationDaysTargetEnabled && participationDaysTargetMet)

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-foreground">{t('myWeeklyTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('myWeeklyDescription')}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
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
          <p className="mt-3 text-xs leading-5 text-muted">{t('myCriteriaOrHint')}</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-1 flex items-center gap-2">
          <Users size={18} className="text-accent" />
          <h2 className="font-semibold text-foreground">{t('mySessionDetailsTitle')}</h2>
        </div>
        <p className="mb-4 text-sm text-muted">{t('mySessionDetailsDescription')}</p>
        {compliance.confirmedSessions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{t('mySessionDetailsEmpty')}</p>
        ) : (
          <div className="space-y-3">
            {compliance.confirmedSessions.map((session) => (
              <article key={session.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <p className="font-medium text-foreground">{formatRange(session.startedAt, session.endedAt, locale)}</p>
                  <span className="text-xs text-muted">
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
          <Video size={18} className="text-accent" />
          <h2 className="font-semibold text-foreground">{t('recentVideoTitle')}</h2>
        </div>
        <p className="text-sm text-muted">{t('recentVideoDescription', { days: 5 })}</p>
        <div className={`mt-4 rounded-lg border p-4 ${
          recentVideoIsEligible
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}>
          <p className={`font-semibold ${
            recentVideoIsEligible ? 'text-emerald-200' : 'text-amber-100'
          }`}>
            {recentVideoIsEligible ? t('recentVideoEligible') : t('recentVideoRequired')}
          </p>
          {compliance.recentVideoUpload && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{t('recentVideoUploadedAt', {
                date: formatDate(compliance.recentVideoUpload.uploadedAt, locale),
              })}</span>
              <span>{t('recentVideoEligibleUntil', {
                date: formatDate(compliance.recentVideoUpload.eligibleUntil, locale),
              })}</span>
              <a
                href={youtubeVideoProofWatchUrl(compliance.recentVideoUpload.videoUrl) ?? compliance.recentVideoUpload.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                {t('openVideo')} <ExternalLink size={12} />
              </a>
            </div>
          )}
          {compliance.recentVideoUpload?.reflectionNote && (
            <p className="mt-2 text-xs leading-relaxed text-muted">
              {t('recentVideoReflectionValue', {
                note: compliance.recentVideoUpload.reflectionNote,
              })}
            </p>
          )}
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor={recentVideoUrlId} className="mb-1.5 block text-xs font-semibold text-foreground">
              {t('recentVideoUrlLabel')}
            </label>
            <input
              id={recentVideoUrlId}
              value={recentVideoUrl}
              onChange={(event) => setRecentVideoUrl(event.target.value)}
              placeholder={t('youtubePlaceholder')}
              className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
            <p className="mt-1 text-xs leading-relaxed text-muted">{t('recentVideoUrlHint')}</p>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor={reflectionNoteId} className="text-xs font-semibold text-foreground">
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
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <button
            type="button"
            disabled={isPending || recentVideoUrl.trim().length === 0}
            onClick={submitRecentVideo}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-transform active:scale-[0.96] disabled:opacity-50 sm:w-auto"
          >
            <Upload size={15} /> {isPending ? t('recentVideoSubmitting') : t('recentVideoSubmit')}
          </button>
          {recentVideoNotice && (
            <p
              role="status"
              className={`rounded-lg border px-3 py-2 text-sm ${
                recentVideoNotice.tone === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              }`}
            >
              {recentVideoNotice.text}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-1 flex items-center gap-2">
          <Video size={18} className="text-accent" />
          <h2 className="font-semibold text-foreground">{t('myVideoTitle')}</h2>
        </div>
        <p className="mb-4 text-sm text-muted">{t('videoRule', { count: compliance.policy.videoEverySessions, days: compliance.policy.videoDueDays })}</p>
        {requirementNotice && (
          <p role="status" className="mb-4 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted">
            {requirementNotice}
          </p>
        )}
        {compliance.requirements.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">{t('myVideoEmpty')}</p>
        ) : (
          <div className="space-y-4">
            {compliance.requirements.map((requirement) => {
              const canSubmit = requirement.status === 'open'
              return (
                <article key={requirement.id} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <p className="font-medium text-foreground">{t(`status.${requirement.status}`)}</p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted"><Clock3 size={13} />{t('dueAt', { date: formatDate(requirement.dueAt, locale) })}</p>
                    </div>
                    {requirement.submission && (
                      <span className="rounded-full border border-border px-2 py-1 text-xs text-muted">{t(`submissionStatus.${requirement.submission.status}`)}</span>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-muted">
                    {t('linkedSessions')}: {requirement.sessions.map((session) => formatDate(session.endedAt, locale)).join(', ')}
                  </div>
                  {canSubmit && requirement.sessions.length > 0 && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
                      <input
                        value={urls[requirement.id] ?? ''}
                        onChange={(event) => setUrls((current) => ({ ...current, [requirement.id]: event.target.value }))}
                        placeholder={t('youtubePlaceholder')}
                        className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                      />
                      <select
                        value={selectedSessions[requirement.id] ?? requirement.sessions[0].id}
                        onChange={(event) => setSelectedSessions((current) => ({ ...current, [requirement.id]: event.target.value }))}
                        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                        aria-label={t('selectSession')}
                      >
                        {requirement.sessions.map((session) => (
                          <option key={session.id} value={session.id}>{formatDate(session.endedAt, locale)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => submit(requirement.id, requirement.sessions[0].id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                      >
                        <Upload size={15} /> {t('submitVideo')}
                      </button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function recentVideoErrorMessage(
  code: string,
  t: ReturnType<typeof useTranslations<'allianceContent'>>,
): string {
  switch (code) {
    case 'MEMBER_GAMEPLAY_VIDEO_INVALID_URL':
      return t('recentVideoInvalid')
    case 'MEMBER_GAMEPLAY_VIDEO_ALREADY_USED':
      return t('recentVideoAlreadyUsed')
    case 'MEMBER_GAMEPLAY_VIDEO_RATE_LIMITED':
      return t('recentVideoRateLimited')
    case 'MEMBER_GAMEPLAY_VIDEO_REFLECTION_TOO_LONG':
      return t('recentVideoReflectionTooLong', {
        max: MAX_GAMEPLAY_VIDEO_REFLECTION_NOTE_LENGTH,
      })
    default:
      return t('requestFailed')
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  )
}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatRange(startedAt: string, endedAt: string, locale: string): string {
  return `${formatDate(startedAt, locale)} – ${formatDate(endedAt, locale)}`
}
