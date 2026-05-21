import Link from 'next/link'
import { ChevronRight, FilePlus2, ShieldCheck, WalletCards } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_REGEAR_LIST } from '@/data/demo-seed'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'
import { formatSilver, formatTimeLabel } from '../_lib/format'

const CURRENT_USER = 'Eternia'

export default async function DemoMemberRegearPage() {
  const [t, tDemo, tCta] = await Promise.all([
    getTranslations('demo.memberRegear'),
    getTranslations('demo'),
    getTranslations('demo.ctaCard'),
  ])
  const myRequests = DEMO_REGEAR_LIST.filter((request) => request.victim === CURRENT_USER)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck size={20} className="text-amber-400" />
          {t('title')}
        </h1>
        <p className="text-gray-400 text-sm mt-1">{t('subtitle')}</p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <ShieldCheck size={20} className="text-emerald-300" />
          <h2 className="mt-3 text-sm font-bold text-white">{t('autoTitle')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-emerald-100/80">{t('autoDescription')}</p>
          <Link
            href="/demo/regear/rg-1"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-200 hover:text-emerald-100"
          >
            {t('viewAutoClaim')}
            <ChevronRight size={13} />
          </Link>
        </div>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <FilePlus2 size={20} className="text-amber-300" />
          <h2 className="mt-3 text-sm font-bold text-white">{t('manualTitle')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">{t('manualDescription')}</p>
          <DemoActionButton className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400">
            <FilePlus2 size={13} />
            {t('manualButton')}
          </DemoActionButton>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-white">{t('myRequestsTitle')}</h2>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
            {t('pendingCount', { count: myRequests.length })}
          </span>
        </div>
        <div className="space-y-2">
          {myRequests.map((request) => (
            <Link
              key={request.id}
              href={`/demo/regear/${request.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 hover:border-amber-500/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{request.battleLabel}</p>
                <p className="text-xs text-gray-500">
                  {formatTimeLabel(tDemo, request.diedAt)} · {request.killerWeapon}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-amber-300 font-mono">
                  {formatSilver(request.totalSilver)}
                </p>
                <p className="text-[11px] text-gray-500">{t(`status.${request.status}`)}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 flex items-center gap-3">
        <WalletCards size={18} className="text-amber-300 shrink-0" />
        <p className="text-xs text-gray-400 leading-relaxed">{t('walletHint')}</p>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('regear.title')}
        description={tCta('regear.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
