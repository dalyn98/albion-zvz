'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { BarChart3, Clock3, ShieldBan, ShieldCheck, X } from 'lucide-react'
import {
  clearMemberExchangeRestriction,
  setMemberExchangeRestriction,
} from '@/app/actions/member-exchange-restrictions'
import {
  MAX_MEMBER_EXCHANGE_RESTRICTION_DAYS,
  MAX_MEMBER_EXCHANGE_RESTRICTION_REASON_LENGTH,
} from '@/lib/member-exchange-restrictions'
import type { AllianceContentAdminDashboard } from '@/lib/alliance-content-compliance-data'
import { useBodyScrollLock } from './useBodyScrollLock'

export default function AllianceContentComplianceStatsPanel({
  dashboard,
  canManageExchangeRestrictions,
}: {
  dashboard: Pick<
    AllianceContentAdminDashboard,
    'policy' | 'stats' | 'exchangeRestrictions'
  >
  canManageExchangeRestrictions: boolean
}) {
  const t = useTranslations('allianceContent')
  const locale = useLocale()
  const router = useRouter()
  const [windowDays, setWindowDays] = useState<7 | 30>(7)
  const [isPending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)
  const [restrictionMember, setRestrictionMember] = useState<{
    discordId: string
    username: string
  } | null>(null)
  const [blockedUntil, setBlockedUntil] = useState('')
  const [reason, setReason] = useState('')
  useBodyScrollLock(restrictionMember !== null)
  const stats = windowDays === 7 ? dashboard.stats.sevenDays : dashboard.stats.thirtyDays
  const restrictionByMember = new Map(
    dashboard.exchangeRestrictions.map((restriction) => [
      restriction.discordId,
      restriction,
    ]),
  )

  const openRestrictionDialog = (discordId: string, username: string) => {
    setNotice(null)
    setRestrictionMember({ discordId, username })
    setBlockedUntil('')
    setReason('')
  }

  const saveRestriction = () => {
    if (!restrictionMember) return
    if (!blockedUntil) {
      setNotice(t('exchangeRestrictionError.invalidExpiry'))
      return
    }
    if (!reason.trim()) {
      setNotice(t('exchangeRestrictionError.reasonRequired'))
      return
    }
    const blockedUntilDate = new Date(blockedUntil)
    if (!Number.isFinite(blockedUntilDate.getTime())) {
      setNotice(t('exchangeRestrictionError.invalidExpiry'))
      return
    }
    const blockedUntilIso = blockedUntilDate.toISOString()
    const member = restrictionMember
    setNotice(null)
    startTransition(async () => {
      const result = await setMemberExchangeRestriction({
        discordId: member.discordId,
        blockedUntil: blockedUntilIso,
        reason,
      })
      if (!result.ok) {
        setNotice(exchangeRestrictionErrorMessage(result.code, t))
        return
      }
      setRestrictionMember(null)
      setReason('')
      setNotice(t('exchangeRestrictionSaved'))
      router.refresh()
    })
  }

  const liftRestriction = (discordId: string) => {
    setNotice(null)
    startTransition(async () => {
      const result = await clearMemberExchangeRestriction(discordId)
      setNotice(
        result.ok
          ? t('exchangeRestrictionLifted')
          : exchangeRestrictionErrorMessage(result.code, t),
      )
      if (result.ok) router.refresh()
    })
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={17} className="text-accent" />
            <h2 className="font-semibold text-foreground">{t('statsTitle')}</h2>
          </div>
          <p className="mt-1 text-sm text-muted">{t('statsDescription')}</p>
        </div>
        <div className="inline-flex self-start rounded-lg border border-border bg-background p-1">
          {([7, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                windowDays === days
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {t(days === 7 ? 'statsWindow7' : 'statsWindow30')}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label={t('statsTotalSessions')} value={stats.totalSessions} />
        <StatCard label={t('statsAverageRate')} value={`${stats.averageParticipationRate}%`} />
        <StatCard label={t('statsAchievedMembers')} value={stats.achievedMemberCount} tone="success" />
        <StatCard label={t('statsBelowMembers')} value={stats.belowMemberCount} tone="danger" />
      </div>

      {notice && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted"
        >
          {notice}
        </p>
      )}

      {stats.members.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
          {t('statsEmpty')}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table
            className={`w-full text-left text-sm ${
              canManageExchangeRestrictions ? 'min-w-[980px]' : 'min-w-[720px]'
            }`}
          >
            <thead className="bg-background text-xs text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">{t('statsMember')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('statsParticipation')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('statsRate')}</th>
                <th className="px-3 py-2.5 text-center font-medium">{t('statsTarget')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('statsMissingVideos')}</th>
                <th className="px-3 py-2.5 text-right font-medium">{t('statsSubmittedVideos')}</th>
                {canManageExchangeRestrictions && (
                  <th className="px-3 py-2.5 text-right font-medium">
                    {t('statsExchangeAccess')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.members.map((member) => {
                const restriction = restrictionByMember.get(member.discordId)
                const isLocalAccount = member.discordId.startsWith('local:')
                return (
                <tr key={member.discordId} className="text-foreground">
                  <td className="px-3 py-3 font-medium">{member.username}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {t('statsParticipationValue', {
                      count: member.participationCount,
                      total: stats.totalSessions,
                    })}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {member.participationRate}%
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      member.hasMetTarget
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/15 text-rose-300'
                    }`}>
                      {t(member.hasMetTarget ? 'statsTargetMet' : 'statsTargetBelow')}
                    </span>
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums ${
                    member.missingVideoCount > 0 ? 'font-semibold text-rose-300' : 'text-muted'
                  }`}>
                    {member.missingVideoCount}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted">
                    {member.submittedVideoCount}
                  </td>
                  {canManageExchangeRestrictions && (
                    <td className="px-3 py-3 text-right">
                      {isLocalAccount ? (
                        <span className="text-xs text-muted">{t('exchangeUnavailableAccount')}</span>
                      ) : restriction ? (
                        <div className="flex items-center justify-end gap-2">
                          <span
                            title={restriction.reason}
                            className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-xs font-semibold text-rose-300"
                          >
                            <ShieldBan size={12} aria-hidden="true" />
                            {t('exchangeRestrictedUntil', {
                              until: formatRestrictionDate(restriction.blockedUntil, locale),
                            })}
                          </span>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => liftRestriction(member.discordId)}
                            className="min-h-9 rounded-lg border border-border px-2.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50"
                          >
                            {t('exchangeLift')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                            <ShieldCheck size={12} aria-hidden="true" />
                            {t('exchangeAvailable')}
                          </span>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => openRestrictionDialog(member.discordId, member.username)}
                            className="min-h-9 rounded-lg border border-rose-500/40 px-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                          >
                            {t('exchangeRestrict')}
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        {t('statsTargetHint', {
          sessions: stats.members[0]?.targetSessionCount ?? 0,
          rate: dashboard.policy.weeklyMinParticipationRate,
        })}
      </p>

      {restrictionMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exchange-restriction-title"
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-4 sm:items-center"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-rose-500/40 bg-background p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="exchange-restriction-title" className="text-lg font-bold text-foreground">
                  {t('exchangeRestrictionTitle')}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {t('exchangeRestrictionDescription', {
                    username: restrictionMember.username,
                  })}
                </p>
              </div>
              <button
                type="button"
                aria-label={t('exchangeRestrictionClose')}
                onClick={() => setRestrictionMember(null)}
                className="rounded-lg p-2 text-muted hover:bg-surface hover:text-foreground"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Clock3 size={13} aria-hidden="true" />
                {t('exchangeRestrictionUntilLabel')}
              </span>
              <input
                type="datetime-local"
                value={blockedUntil}
                onChange={(event) => setBlockedUntil(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
              <span className="block text-xs text-muted">
                {t('exchangeRestrictionUntilHint', {
                  days: MAX_MEMBER_EXCHANGE_RESTRICTION_DAYS,
                })}
              </span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">
                {t('exchangeRestrictionReasonLabel')}
              </span>
              <textarea
                rows={4}
                maxLength={MAX_MEMBER_EXCHANGE_RESTRICTION_REASON_LENGTH}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('exchangeRestrictionReasonPlaceholder')}
                className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
              />
              <span className="block text-right text-[10px] tabular-nums text-muted">
                {reason.length} / {MAX_MEMBER_EXCHANGE_RESTRICTION_REASON_LENGTH}
              </span>
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setRestrictionMember(null)}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-muted hover:bg-surface disabled:opacity-50"
              >
                {t('exchangeRestrictionCancel')}
              </button>
              <button
                type="button"
                disabled={isPending || !blockedUntil || !reason.trim()}
                onClick={saveRestriction}
                className="min-h-11 rounded-lg bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {isPending ? t('exchangeRestrictionSaving') : t('exchangeRestrictionConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function formatRestrictionDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function exchangeRestrictionErrorMessage(
  code: string | undefined,
  t: ReturnType<typeof useTranslations<'allianceContent'>>,
): string {
  switch (code) {
    case 'invalidMember':
      return t('exchangeRestrictionError.invalidMember')
    case 'invalidExpiry':
      return t('exchangeRestrictionError.invalidExpiry')
    case 'expiryTooLong':
      return t('exchangeRestrictionError.expiryTooLong')
    case 'reasonRequired':
      return t('exchangeRestrictionError.reasonRequired')
    case 'reasonTooLong':
      return t('exchangeRestrictionError.reasonTooLong')
    case 'unauthorized':
      return t('exchangeRestrictionError.unauthorized')
    default:
      return t('requestFailed')
  }
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number | string
  tone?: 'default' | 'success' | 'danger'
}) {
  const valueClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'danger'
        ? 'text-rose-300'
        : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  )
}
