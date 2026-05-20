import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, FileText, MinusCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { listMySettlementLines } from '@/app/actions/settlements'
import { formatSilver } from '@/lib/silver'

export const dynamic = 'force-dynamic'

export default async function MySettlementsPage() {
  const session = await getSession()
  if (!session) redirect('/api/auth/discord/start?returnTo=/me/settlements')
  if (!session.isMember) redirect('/')

  const [t, tCommon, result] = await Promise.all([
    getTranslations('mySettlements'),
    getTranslations('common'),
    listMySettlementLines(),
  ])
  const latest = result.lines[0] ?? null

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <header className="space-y-2">
        <Link href="/me" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
          <ArrowLeft size={14} />
          {tCommon('backToMyPage')}
        </Link>
        <div className="flex items-center gap-2">
          <FileText size={21} className="text-amber-400" />
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
        </div>
        <p className="text-sm text-gray-400">{t('description')}</p>
      </header>

      {result.error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {result.error}
        </div>
      )}

      {result.lines.length === 0 ? (
        <p className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-10 text-center text-sm text-gray-500">
          {t('empty')}
        </p>
      ) : (
        <section className="space-y-3">
          {latest && <LatestSettlementSummary line={latest} t={t} />}
          {result.lines.map((line) => (
            <article key={line.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {periodLabel(line.period.periodStart, line.period.periodEnd)}
                  </h2>
                  <p className="text-xs text-gray-500">{t(`status.${line.period.status}`)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-gray-500">{t('closingBalance')}</p>
                  <p className="font-mono text-lg font-bold text-white">{formatSilver(line.closingBalance)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <SmallMetric label={t('opening')} value={formatSilver(line.openingBalance)} />
                <SmallMetric label={t('earned')} value={formatSilver(line.earned)} tone="text-emerald-200" />
                <SmallMetric label={t('spent')} value={formatSilver(line.spent)} tone="text-rose-200" />
                <SmallMetric
                  label={line.receivableSilver > 0 ? t('receivable') : t('payable')}
                  value={formatSilver(line.receivableSilver > 0 ? line.receivableSilver : line.payableSilver)}
                  tone={line.receivableSilver > 0 ? 'text-amber-200' : 'text-sky-200'}
                />
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}

function LatestSettlementSummary({
  line,
  t,
}: {
  line: Awaited<ReturnType<typeof listMySettlementLines>>['lines'][number]
  t: Awaited<ReturnType<typeof getTranslations<'mySettlements'>>>
}) {
  const amount = Math.max(line.receivableSilver, line.payableSilver)
  const isReceivable = line.receivableSilver > 0
  const isPayable = line.payableSilver > 0
  const Icon = isReceivable ? TrendingUp : isPayable ? TrendingDown : MinusCircle
  const tone = isReceivable
    ? 'border-amber-500/35 bg-amber-500/10 text-amber-100'
    : isPayable
      ? 'border-sky-500/35 bg-sky-500/10 text-sky-100'
      : 'border-gray-700 bg-gray-900 text-gray-200'
  const title = isReceivable
    ? t('latestReceivableTitle', { amount: formatSilver(amount) })
    : isPayable
      ? t('latestPayableTitle', { amount: formatSilver(amount) })
      : t('latestEvenTitle')

  return (
    <article className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        <Icon size={20} className="flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="text-xs leading-relaxed opacity-80 mt-1">
            {line.period.status === 'closed'
              ? t('latestClosedDescription')
              : t('latestDraftDescription')}
          </p>
          <p className="text-[11px] opacity-70 mt-2">
            {t('latestLedgerEntries', { count: line.ledgerEntryCount })}
          </p>
        </div>
      </div>
    </article>
  )
}

function periodLabel(start: string, end: string): string {
  return `${start} - ${exclusiveEndToInclusive(end)}`
}

function exclusiveEndToInclusive(end: string): string {
  const date = new Date(`${end}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function SmallMetric({ label, value, tone = 'text-gray-200' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2">
      <p className="text-gray-500">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold ${tone}`}>{value}</p>
    </div>
  )
}
