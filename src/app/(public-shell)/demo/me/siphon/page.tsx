import Link from 'next/link'
import { ArrowLeft, PackageCheck, PackageMinus, Zap } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import DemoGuidedTour from '../../_components/DemoGuidedTour'
import { DEMO_SIPHON_BALANCES, DEMO_SIPHON_LEDGER } from '@/data/demo-seed'

const CURRENT_USER = 'Eternia'
const MY_SIPHON_TOUR_STEPS = [
  { id: 'my-siphon-summary' },
  { id: 'my-siphon-history' },
] as const

export default async function DemoMySiphonPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations('mySiphon'),
    getTranslations('common'),
  ])
  const account = DEMO_SIPHON_BALANCES.find((row) => row.player === CURRENT_USER) ?? DEMO_SIPHON_BALANCES[0]
  const rows = DEMO_SIPHON_LEDGER.filter((row) => row.player === account.player)
  const netClass = account.net < 0 ? 'text-rose-300' : account.net > 0 ? 'text-emerald-300' : 'text-white'
  const netSub = account.net < 0 ? t('negativeSub') : account.net > 0 ? t('positiveSub') : t('zeroSub')

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DemoGuidedTour steps={MY_SIPHON_TOUR_STEPS} namespace="mySiphon" />
      <div>
        <Link
          href="/demo/me"
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

      <section
        data-tour-id="my-siphon-summary"
        className="rounded-2xl border border-gray-700 bg-gray-900 p-4 sm:p-5 space-y-4"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('matchedPlayerLabel')}
          </p>
          <p className="mt-1 text-lg font-bold text-white font-mono">{account.player}</p>
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
          <Metric label={t('lastActivityLabel')} value={account.lastActivityAt} />
        </div>
      </section>

      <section data-tour-id="my-siphon-history" className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-white">{t('historyTitle')}</h2>
          <p className="text-gray-400 text-xs leading-relaxed mt-1">{t('historyDescription')}</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-gray-800 bg-gray-900">
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
              {rows.map((row) => {
                const deposit = row.quantity > 0
                return (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">
                      {row.loggedAt}
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
      </section>
    </div>
  )
}

type MySiphonTranslator = Awaited<ReturnType<typeof getTranslations>>

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
