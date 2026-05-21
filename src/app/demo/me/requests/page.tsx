import Link from 'next/link'
import { ArrowLeft, Coins, HandHeart, ShieldCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import DemoGuidedTour from '../../_components/DemoGuidedTour'
import {
  DEMO_DONATION_REQUESTS,
  DEMO_EXCHANGE_REQUESTS,
  DEMO_REGEAR_LIST,
  type DemoApprovalCommonStatus,
  type DemoRegearStatus,
} from '@/data/demo-seed'
import { formatSilver, formatTimeLabel } from '../../_lib/format'

const CURRENT_USER = 'Eternia'
const MY_REQUESTS_TOUR_STEPS = [
  { id: 'my-requests-summary' },
  { id: 'my-requests-regear' },
  { id: 'my-requests-exchange' },
  { id: 'my-requests-donation' },
] as const

const STATUS_CLASS: Record<DemoApprovalCommonStatus | DemoRegearStatus, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

export default async function DemoMyRequestsPage() {
  const [t, tMe, tCommon, tStatus, tDemo] = await Promise.all([
    getTranslations('myRequests'),
    getTranslations('me'),
    getTranslations('common'),
    getTranslations('status'),
    getTranslations('demo'),
  ])
  const myRegears = DEMO_REGEAR_LIST.filter((request) => request.victim === CURRENT_USER)
  const myExchanges = DEMO_EXCHANGE_REQUESTS.filter((request) =>
    ['Frostpine', 'Mochi'].includes(request.member),
  )
  const myDonations = DEMO_DONATION_REQUESTS.filter((request) =>
    ['Eternia', 'Daewi'].includes(request.member),
  )
  const pendingTotal =
    myRegears.filter((request) => request.status === 'pending').length +
    myExchanges.filter((request) => request.status === 'pending').length +
    myDonations.filter((request) => request.status === 'pending').length

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <DemoGuidedTour steps={MY_REQUESTS_TOUR_STEPS} namespace="myRequests" />
      <div>
        <Link
          href="/demo/me"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-2"
        >
          <ArrowLeft size={14} />
          {tCommon('backToMyPage')}
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('title')}</h1>
        <p className="text-gray-400 text-sm">
          {pendingTotal > 0 ? t('descriptionPending', { count: pendingTotal }) : t('description')}
        </p>
      </div>

      <section data-tour-id="my-requests-summary" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <RequestSummaryCard
          label={tMe('regearListTitle')}
          total={myRegears.length}
          pending={myRegears.filter((request) => request.status === 'pending').length}
          pendingLabel={t('summaryPending')}
          totalLabel={t('summaryTotal')}
        />
        <RequestSummaryCard
          label={tMe('exchangeTitle')}
          total={myExchanges.length}
          pending={myExchanges.filter((request) => request.status === 'pending').length}
          pendingLabel={t('summaryPending')}
          totalLabel={t('summaryTotal')}
        />
        <RequestSummaryCard
          label={tMe('donationTitle')}
          total={myDonations.length}
          pending={myDonations.filter((request) => request.status === 'pending').length}
          pendingLabel={t('summaryPending')}
          totalLabel={t('summaryTotal')}
        />
      </section>

      <section data-tour-id="my-requests-regear" className="space-y-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ShieldCheck size={17} className="text-amber-300" />
          {tMe('regearListTitle')}
        </h2>
        <ul className="space-y-2">
          {myRegears.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{request.battleLabel}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatTimeLabel(tDemo, request.diedAt)}
                    <span className="mx-1">·</span>
                    {request.killerName}
                  </p>
                </div>
                <StatusPill status={request.status} label={tStatus(request.status)} />
              </div>
              <p className="mt-2 text-sm font-mono text-amber-200">{formatSilver(request.totalSilver)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section data-tour-id="my-requests-exchange" className="space-y-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Coins size={17} className="text-amber-300" />
          {tMe('exchangeTitle')}
        </h2>
        <ul className="space-y-2">
          {myExchanges.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-mono font-semibold text-white">
                    {request.points.toLocaleString('en-US')}P → {formatSilver(request.silver)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {tMe('requestedAt', { when: formatTimeLabel(tDemo, request.requestedAt) })}
                    {request.handledBy && (
                      <span className="ml-2">· {tMe('handledBy', { handler: request.handledBy })}</span>
                    )}
                  </p>
                </div>
                <StatusPill status={request.status} label={tStatus(request.status)} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section data-tour-id="my-requests-donation" className="space-y-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <HandHeart size={17} className="text-emerald-300" />
          {tMe('donationTitle')}
        </h2>
        <ul className="space-y-2">
          {myDonations.map((request) => (
            <li
              key={request.id}
              className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-mono font-semibold text-white">
                    {tMe('donationAmount', { amount: formatSilver(request.silver) })}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{request.note}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {tMe('requestedAt', { when: formatTimeLabel(tDemo, request.requestedAt) })}
                    {request.handledBy && (
                      <span className="ml-2">· {tMe('handledBy', { handler: request.handledBy })}</span>
                    )}
                  </p>
                </div>
                <StatusPill status={request.status} label={tStatus(request.status)} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function RequestSummaryCard({
  label,
  total,
  pending,
  pendingLabel,
  totalLabel,
}: {
  label: string
  total: number
  pending: number
  pendingLabel: string
  totalLabel: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-lg font-bold text-white">{total}</span>
        <span className="text-xs text-yellow-300">{pendingLabel}: {pending}</span>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">{totalLabel}</p>
    </div>
  )
}

function StatusPill({
  status,
  label,
}: {
  status: DemoApprovalCommonStatus | DemoRegearStatus
  label: string
}) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[status]}`}>
      {label}
    </span>
  )
}
