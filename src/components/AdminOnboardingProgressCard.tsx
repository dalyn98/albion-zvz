import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Circle, ClipboardCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { formatDateTimeShort } from '@/lib/format-datetime'
import type {
  TenantOnboardingProgressKey,
  TenantOnboardingSummary,
} from '@/lib/tenant-onboarding-events'
import { TENANT_LAUNCH_PLAN_PROGRESS_KEYS } from '@/lib/tenant-onboarding-events'

interface Props {
  summary: TenantOnboardingSummary
  children?: ReactNode
}

const STEP_ACCENT: Record<TenantOnboardingProgressKey, string> = {
  botInstalled: 'text-emerald-300',
  setupCompleted: 'text-sky-300',
  adminDashboardViewed: 'text-cyan-300',
  memberInviteCopied: 'text-lime-300',
  testAnnouncementSent: 'text-amber-300',
  firstEventCreated: 'text-violet-300',
  firstEventPublished: 'text-fuchsia-300',
  firstEventNotificationSent: 'text-rose-300',
}

export default async function AdminOnboardingProgressCard({ summary, children }: Props) {
  const t = await getTranslations('adminOnboardingProgress')
  const completedLaunchSteps = TENANT_LAUNCH_PLAN_PROGRESS_KEYS.reduce(
    (count, key) => count + (summary.completed[key] ? 1 : 0),
    0,
  )
  const percent = Math.round((completedLaunchSteps / TENANT_LAUNCH_PLAN_PROGRESS_KEYS.length) * 100)
  const blockingDiagnosis = summary.diagnoses.find((d) => d.severity !== 'ok')

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-card space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-soft-foreground">
            {t('eyebrow')}
          </p>
          <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
          <p className="text-sm text-muted leading-relaxed max-w-3xl">{t('description')}</p>
        </div>
        <div className="min-w-40 rounded-lg border border-border bg-background/60 px-3 py-2">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t('progress')}</span>
            <span className="font-mono text-foreground">
              {t('count', {
                completed: completedLaunchSteps,
                total: TENANT_LAUNCH_PLAN_PROGRESS_KEYS.length,
              })}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        {TENANT_LAUNCH_PLAN_PROGRESS_KEYS.map((key) => {
          const done = summary.completed[key]
          const Icon = done ? CheckCircle2 : Circle
          return (
            <div
              key={key}
              className="flex items-center gap-2 rounded-lg border border-border bg-background/45 px-3 py-2 min-h-11"
            >
              <Icon
                size={15}
                className={done ? STEP_ACCENT[key] : 'text-faint'}
                aria-hidden="true"
              />
              <span className={done ? 'text-xs text-foreground' : 'text-xs text-muted'}>
                {t(`steps.${key}`)}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-accent/25 bg-accent/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          {blockingDiagnosis ? (
            <AlertTriangle size={16} className="mt-0.5 text-amber-300 flex-shrink-0" />
          ) : (
            <ClipboardCheck size={16} className="mt-0.5 text-emerald-300 flex-shrink-0" />
          )}
          <div>
            <div className="text-sm font-semibold text-foreground">
              {t(`next.${summary.nextAction.key}.title`)}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {blockingDiagnosis
                ? t(`diagnoses.${blockingDiagnosis.key}`)
                : t('diagnoses.complete')}
            </p>
          </div>
        </div>
        <Link
          href={summary.nextAction.href}
          className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          {t(`next.${summary.nextAction.key}.cta`)}
        </Link>
      </div>

      <p className="text-xs text-subtle">
        {summary.latestEventAt
          ? t('latest', { time: formatDateTimeShort(summary.latestEventAt) })
          : t('noActivity')}
      </p>

      {children}
    </section>
  )
}
