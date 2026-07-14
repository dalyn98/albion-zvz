'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock3, Upload, Video } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { submitAllianceContentVideo } from '@/app/actions/alliance-content-compliance'
import type { MyAllianceContentCompliance } from '@/lib/alliance-content-compliance-data'

export default function MyAllianceContentCompliancePanel({
  compliance,
}: {
  compliance: MyAllianceContentCompliance
}) {
  const t = useTranslations('allianceContent')
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [selectedSessions, setSelectedSessions] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)

  const submit = (requirementId: string, fallbackSessionId: string) => {
    const sessionId = selectedSessions[requirementId] ?? fallbackSessionId
    const videoUrl = urls[requirementId] ?? ''
    setNotice(null)
    startTransition(async () => {
      const result = await submitAllianceContentVideo({ requirementId, sessionId, videoUrl })
      setNotice(result.ok ? t('videoSubmitted') : t('requestFailed'))
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted" role="status">
          {notice}
        </div>
      )}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-foreground">{t('myWeeklyTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('myWeeklyDescription')}</p>
          </div>
          <CheckCircle2 size={20} className="shrink-0 text-accent" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label={t('mySessions')} value={`${compliance.weekSessionCount}/${compliance.policy.weeklyMinSessions}`} />
          <Metric label={t('myRate')} value={`${compliance.weekParticipationRate}%`} />
          <Metric label={t('weekTotalSessions')} value={String(compliance.weekTotalSessions)} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-1 flex items-center gap-2">
          <Video size={18} className="text-accent" />
          <h2 className="font-semibold text-foreground">{t('myVideoTitle')}</h2>
        </div>
        <p className="mb-4 text-sm text-muted">{t('videoRule', { count: compliance.policy.videoEverySessions, days: compliance.policy.videoDueDays })}</p>
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
