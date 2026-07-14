'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Settings2, Users, Video, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  confirmAllianceContentSession,
  excludeAllianceContentBattles,
  reviewAllianceContentVideo,
  updateAllianceContentPolicy,
} from '@/app/actions/alliance-content-compliance'
import type { AllianceContentAdminDashboard } from '@/lib/alliance-content-compliance-data'

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

  const run = (action: () => Promise<{ ok: boolean }>) => {
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      setNotice(result.ok ? t('saved') : t('requestFailed'))
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
          <div className="space-y-3">
            {dashboard.candidates.map((candidate) => (
              <article key={candidate.battleRecordIds.join(':')} className="rounded-lg border border-border bg-background p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-medium text-foreground">{formatRange(candidate.startedAt, candidate.endedAt, locale)}</p>
                    <p className="mt-1 text-xs text-muted">
                      {t('candidateMeta', { battles: candidate.battleRecordIds.length, members: candidate.participantCount })}
                    </p>
                  </div>
                  <div className="flex gap-2">
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
                      onClick={() => run(() => excludeAllianceContentBattles(candidate.battleRecordIds))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted disabled:opacity-50"
                    >
                      <X size={15} /> {t('exclude')}
                    </button>
                  </div>
                </div>
              </article>
            ))}
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
            {dashboard.sessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="text-foreground">{formatRange(session.startedAt, session.endedAt, locale)}</span>
                <span className="shrink-0 text-muted">{t('participantCount', { count: session.participantCount })}</span>
              </div>
            ))}
          </div>
        )}
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
                      onClick={() => run(() => reviewAllianceContentVideo(submission.id, 'reject'))}
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
    </div>
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
