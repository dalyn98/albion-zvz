import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, AlertTriangle, PackageCheck, PackageMinus, Zap } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { formatDateTime } from '@/lib/format-datetime'
import { getMySiphonAccount, type MySiphonAccountResult } from '@/app/actions/siphon-member'

export const dynamic = 'force-dynamic'

export default async function MySiphonPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/me/siphon')
  }
  if (!session.isMember) {
    redirect('/')
  }

  const guildId = await getSessionGuildId(session)
  const [result, t, tCommon, tz] = await Promise.all([
    getMySiphonAccount(100),
    getTranslations('mySiphon'),
    getTranslations('common'),
    getTenantTimezone(guildId),
  ])

  return (
    <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <Link
          href="/me"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-2"
        >
          <ArrowLeft size={14} />
          {tCommon('backToMyPage')}
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Zap size={22} className="text-amber-300" />
          {t('title')}
        </h1>
        <p className="text-gray-400 text-sm">{t('description')}</p>
      </div>

      {result.status === 'ready' ? (
        <ReadyContent result={result} t={t} tz={tz} />
      ) : result.status === 'unverified' ? (
        <NoticeCard
          tone="warning"
          title={t('unverifiedTitle')}
          body={t('unverifiedBody')}
          cta={{ href: '/onboarding/albion?return=%2Fme%2Fsiphon', label: t('verifyCta') }}
        />
      ) : (
        <NoticeCard tone="danger" title={t('errorTitle')} body={t('errorBody')} />
      )}
    </main>
  )
}

type MySiphonTranslator = Awaited<ReturnType<typeof getTranslations>>

function ReadyContent({
  result,
  t,
  tz,
}: {
  result: Extract<MySiphonAccountResult, { status: 'ready' }>
  t: MySiphonTranslator
  tz: string
}) {
  const account = result.account
  const netClass = account.net < 0
    ? 'text-rose-300'
    : account.net > 0
      ? 'text-emerald-300'
      : 'text-white'
  const netSub = account.net < 0
    ? t('negativeSub')
    : account.net > 0
      ? t('positiveSub')
      : t('zeroSub')

  return (
    <>
      <section className="rounded-2xl border border-gray-700 bg-gray-900 p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('matchedPlayerLabel')}
            </p>
            <p className="mt-1 text-lg font-bold text-white font-mono">{account.player}</p>
          </div>
          {account.net < 0 && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">
              <AlertTriangle size={14} />
              {t('negativeBadge')}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Metric
            label={t('balanceLabel')}
            value={formatSiphonCount(account.net, t)}
            valueClass={netClass}
            sub={netSub}
          />
          <Metric
            label={t('depositedLabel')}
            value={formatSiphonCount(account.deposited, t)}
            valueClass="text-emerald-300"
          />
          <Metric
            label={t('withdrawnLabel')}
            value={formatSiphonCount(account.withdrawn, t)}
            valueClass="text-rose-300"
          />
          <Metric
            label={t('lastActivityLabel')}
            value={
              account.lastActivityAt ? formatDateTime(account.lastActivityAt, tz) : t('noActivity')
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-white">{t('historyTitle')}</h2>
          <p className="text-gray-400 text-xs leading-relaxed mt-1">{t('historyDescription')}</p>
        </div>
        {account.rows.length === 0 ? (
          <p className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-8 text-center text-sm text-gray-500">
            {t('emptyHistory')}
          </p>
        ) : (
          <>
            <div className="space-y-2 sm:hidden">
            {account.rows.map((row, index) => {
              const deposit = row.quantity > 0
              return (
                <article
                  key={`${row.loggedAt}-${row.quantity}-${index}`}
                  className="rounded-xl border border-gray-800 bg-gray-900 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-gray-400">
                        {formatDateTime(row.loggedAt, tz)}
                      </p>
                      <p className="mt-1 truncate text-sm text-gray-300">{row.itemNameRaw}</p>
                    </div>
                    <p
                      className={`shrink-0 font-mono text-sm font-semibold ${
                        deposit ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {formatSiphonCount(row.quantity, t)}
                    </p>
                  </div>
                  <span
                    className={`mt-3 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${
                      deposit
                        ? 'bg-emerald-500/10 text-emerald-300'
                        : 'bg-rose-500/10 text-rose-300'
                    }`}
                  >
                    {deposit ? <PackageCheck size={12} /> : <PackageMinus size={12} />}
                    {deposit ? t('typeDeposit') : t('typeWithdraw')}
                  </span>
                </article>
              )
            })}
            </div>

            <div className="hidden overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900 sm:block">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-950 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left whitespace-nowrap">{t('colTime')}</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">{t('colType')}</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">{t('colQuantity')}</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">{t('colItem')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {account.rows.map((row, index) => {
                  const deposit = row.quantity > 0
                  return (
                    <tr key={`${row.loggedAt}-${row.quantity}-${index}`} className="align-top">
                      <td className="px-3 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">
                        {formatDateTime(row.loggedAt, tz)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold ${
                            deposit
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : 'bg-rose-500/10 text-rose-300'
                          }`}
                        >
                          {deposit ? <PackageCheck size={12} /> : <PackageMinus size={12} />}
                          {deposit ? t('typeDeposit') : t('typeWithdraw')}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-mono font-semibold ${
                          deposit ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {formatSiphonCount(row.quantity, t)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">{row.itemNameRaw}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </section>
    </>
  )
}

function NoticeCard({
  tone,
  title,
  body,
  cta,
}: {
  tone: 'warning' | 'danger'
  title: string
  body: string
  cta?: { href: string; label: string }
}) {
  const toneClass = tone === 'warning'
    ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100'
    : 'border-rose-500/30 bg-rose-500/10 text-rose-100'
  return (
    <section className={`rounded-2xl border px-4 py-5 ${toneClass}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed opacity-80">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="inline-block mt-3 text-xs font-semibold underline underline-offset-2 hover:opacity-80"
        >
          {cta.label}
        </Link>
      )}
    </section>
  )
}

function Metric({
  label,
  value,
  sub,
  valueClass = 'text-white',
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${valueClass}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

function formatSiphonCount(n: number, t: MySiphonTranslator): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return t('unit', { count: `${sign}${Math.abs(n).toLocaleString('en-US')}` })
}
