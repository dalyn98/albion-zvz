import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Clock, MapPin, Swords, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react'
import { DEMO_REGEAR_LIST } from '@/data/demo-seed'
import { formatTimeLabel, formatSilver } from '../_lib/format'
import { RegearStatusPill, RegearOriginPill } from '../_components/Pills'
import DemoRegearTabs from '../_components/DemoRegearTabs'

// 실제 /regear 페이지 비주얼 클론.
// - tabEligible: 현재 진행 중인 전투에서 자동 청구 1건이 잡혀 있는 모습.
// - tabHistory: DEMO_REGEAR_LIST 전체 (auto/manual, pending/approved/rejected 섞여 있음).
export default async function DemoRegearPage() {
  const [t, tDemo] = await Promise.all([
    getTranslations('regear'),
    getTranslations('demo'),
  ])

  // 데모는 evt-1 이 "막 시작된 전투" 라고 가정. tabEligible 카드 1건.
  const eligibleEvent = {
    id: 'evt-1',
    title: 'Roads 7v7 — Mercia Ore',
    gather_label: tDemo('day.today') + ' 22:00',
    zone: 'Black Zone — Mercia',
    battle_started_label: '22:14',
    role_label: 'Tank · Heavy Mace',
    role_reward: 1_500_000,
    auto_request_id: 'rg-1',
  }

  const eligibleSection = (
    <ul className="space-y-3">
      <li className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link
                href={`/demo/events/${eligibleEvent.id}`}
                className="text-base sm:text-lg font-bold text-white hover:text-amber-300 truncate"
              >
                {eligibleEvent.title}
              </Link>
              <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                <Swords size={10} />
                {t('battleStartedAt', { time: eligibleEvent.battle_started_label })}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <div className="flex items-center gap-1.5 text-gray-300">
                <Clock size={13} className="text-amber-400" />
                {eligibleEvent.gather_label}
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <MapPin size={13} className="text-amber-400" />
                {eligibleEvent.zone}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-800">
          <div className="text-xs text-gray-400 min-w-0">
            <span className="text-gray-500">{t('role')} </span>
            <span className="text-white font-semibold">{eligibleEvent.role_label}</span>
            <span className="text-gray-500"> · {t('expectedReward')} </span>
            <span className="text-amber-400 font-mono font-semibold">
              {formatSilver(eligibleEvent.role_reward)}
            </span>
          </div>
          <Link
            href={`/demo/regear/${eligibleEvent.auto_request_id}`}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-3 py-2"
          >
            <Sparkles size={13} />
            {t('autoClaimedView')}
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="-mt-1 flex items-center gap-2 text-[11px] text-emerald-300/80">
          <Sparkles size={12} />
          <span>{t('autoClaimedLabel')}</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-400 leading-snug">{t('autoClaimedHint')}</span>
        </div>
      </li>
    </ul>
  )

  const historySection = (
    <ul className="space-y-3">
      {DEMO_REGEAR_LIST.map((rg) => {
        const linkable = rg.id === 'rg-1'
        const inner = (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-2 transition-colors hover:border-gray-600">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">
                    {rg.victim}
                  </h3>
                  <RegearStatusPill status={rg.status} t={tDemo} />
                  <RegearOriginPill origin={rg.origin} t={tDemo} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                  <span>{rg.battleLabel}</span>
                  <span className="text-gray-600">·</span>
                  <span>{formatTimeLabel(tDemo, rg.diedAt)}</span>
                  <span className="text-gray-600">·</span>
                  <span>
                    {rg.killerName} <span className="text-gray-600">({rg.killerWeapon})</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-base font-mono font-bold text-amber-400">
                  {formatSilver(rg.totalSilver)}
                </span>
                {linkable && <ArrowRight size={14} className="text-gray-500" />}
              </div>
            </div>
          </div>
        )
        if (!linkable) return <li key={rg.id}>{inner}</li>
        return (
          <li key={rg.id}>
            <Link href={`/demo/regear/${rg.id}`} className="block">
              {inner}
            </Link>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('pageTitle')}</h1>
          <p className="text-gray-400 text-sm">{t('pageDescription')}</p>
        </div>
      </div>

      <DemoRegearTabs
        eligibleCount={1}
        historyCount={DEMO_REGEAR_LIST.length}
        eligibleSection={
          DEMO_REGEAR_LIST.length === 0 ? (
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
              <ShieldCheck size={28} className="text-gray-600 mx-auto" />
              <p className="text-gray-400 text-sm">{t('noEligible')}</p>
              <p className="text-gray-600 text-xs">{t('noEligibleHint')}</p>
            </div>
          ) : (
            eligibleSection
          )
        }
        historySection={historySection}
      />

      <p className="text-[11px] text-gray-600 italic px-1">{tDemo('regear.demoOnlyDetail')}</p>
    </div>
  )
}
