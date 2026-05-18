import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  Box,
  ClipboardList,
  Crown,
  Hammer,
  Sparkles,
  ToggleRight,
  User,
} from 'lucide-react'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'

// 실 /admin/dashboard/craft 의 비주얼 클론 — 토글/박스 범위/만료일 + 제작자
// 권한 패널 + 진행 중인 작업 리스트. 실 페이지는 AdminCraftSettingsForm /
// AdminCraftCraftersPanel / AdminCraftTasksList 등 다수 client 컴포넌트 조합.
// SSR 정적 마크업으로 핵심 만 발췌.

const CRAFTERS = DEMO_MEMBERS.slice(0, 3).map((m, idx) => ({
  ign: m.ign,
  mode: idx === 0 ? 'paid' as const : idx === 1 ? 'volunteer' as const : 'paid' as const,
  premium: idx === 0 ? 15 : idx === 2 ? 10 : 0,
  boxRange: idx === 0 ? '1~10' : idx === 1 ? '11~20' : '21~30',
}))

const TASKS = [
  { id: 't1', requester: DEMO_MEMBERS[3].ign, item: 'Heavy Mace .3', crafter: DEMO_MEMBERS[0].ign, status: 'claimed' as const, box: 4 },
  { id: 't2', requester: DEMO_MEMBERS[4].ign, item: 'Guardian Armor .3', crafter: DEMO_MEMBERS[1].ign, status: 'delivered' as const, box: 14 },
  { id: 't3', requester: DEMO_MEMBERS[5].ign, item: 'Holy Staff .3', crafter: null, status: 'queued' as const, box: null },
  { id: 't4', requester: DEMO_MEMBERS[6].ign, item: 'Heavy Crossbow .3', crafter: DEMO_MEMBERS[2].ign, status: 'claimed' as const, box: 24 },
  { id: 't5', requester: DEMO_MEMBERS[7].ign, item: 'Cape .3', crafter: null, status: 'queued' as const, box: null },
]

const STATUS_STYLE: Record<typeof TASKS[number]['status'], { bg: string; text: string; label: 'status_queued' | 'status_claimed' | 'status_delivered' }> = {
  queued: { bg: 'bg-gray-700/40', text: 'text-gray-300', label: 'status_queued' },
  claimed: { bg: 'bg-amber-500/15', text: 'text-amber-300', label: 'status_claimed' },
  delivered: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', label: 'status_delivered' },
}

export default async function DemoCraftAdminPage() {
  const [t, tDemoMe, tDemoCraft, tCta] = await Promise.all([
    getTranslations('adminCraft'),
    getTranslations('demo.me'),
    getTranslations('demo.craft'),
    getTranslations('demo.ctaCard'),
  ])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Hammer size={20} className="text-amber-400" />
            {t('pageTitle')}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{t('pageDescription')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemoCraft('adminNotice')}</p>
      </div>

      {/* 빠른 이동 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Link
          href="/demo/craft/queue"
          className="flex items-center gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-xl px-3 py-3 transition-colors"
        >
          <Hammer size={16} className="text-amber-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">/craft/queue</p>
            <p className="text-[11px] text-gray-500 truncate">{tDemoCraft('linkQueue')}</p>
          </div>
        </Link>
        <Link
          href="/demo/craft/my-tasks"
          className="flex items-center gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-xl px-3 py-3 transition-colors"
        >
          <Box size={16} className="text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">/craft/my-tasks</p>
            <p className="text-[11px] text-gray-500 truncate">{tDemoCraft('linkMyTasks')}</p>
          </div>
        </Link>
        <Link
          href="/demo/craft/orders"
          className="flex items-center gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-xl px-3 py-3 transition-colors"
        >
          <ClipboardList size={16} className="text-sky-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">/craft/orders</p>
            <p className="text-[11px] text-gray-500 truncate">{tDemoCraft('linkOrders')}</p>
          </div>
        </Link>
      </div>

      {/* 기본 설정 */}
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ToggleRight size={16} className="text-emerald-400" />
          {t('settingsTitle')}
        </h2>
        <p className="text-xs text-gray-500">{t('settingsHint')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-white text-sm font-semibold">{t('enabledLabel')}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{t('enabledHint')}</p>
            </div>
            <DemoActionButton
              asDiv
              className="relative inline-flex h-6 w-11 rounded-full bg-emerald-500/40 border border-emerald-500/60 cursor-pointer shrink-0"
            >
              <span className="absolute right-0.5 top-0.5 h-4 w-4 rounded-full bg-emerald-300 shadow" />
            </DemoActionButton>
          </div>

          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2">
            <p className="text-white text-sm font-semibold">{t('rangeMinLabel')} / {t('rangeMaxLabel')}</p>
            <div className="flex items-center gap-2">
              <DemoActionButton
                asDiv
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono cursor-text"
              >
                1
              </DemoActionButton>
              <span className="text-gray-500">~</span>
              <DemoActionButton
                asDiv
                className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono cursor-text"
              >
                30
              </DemoActionButton>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-gray-500">{t('expiryDaysLabel')}</span>
              <DemoActionButton
                asDiv
                className="bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 font-mono cursor-text"
              >
                7
              </DemoActionButton>
            </div>
          </div>
        </div>
      </section>

      {/* 제작자 권한 */}
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Crown size={16} className="text-amber-400" />
          {t('craftersTitle')}
        </h2>
        <p className="text-xs text-gray-500">{t('craftersHint')}</p>
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          {t('craftersListTitle', { count: CRAFTERS.length })}
        </p>
        <ul className="space-y-2">
          {CRAFTERS.map((c) => (
            <li
              key={c.ign}
              className="flex items-center gap-3 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2"
            >
              <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                <User size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">{c.ign}</p>
                <p className="text-[11px] text-gray-500">
                  {c.mode === 'paid'
                    ? t('crafterModePaid', { premium: c.premium })
                    : t('crafterModeVolunteer')}
                  {' · '}
                  {t('boxRangeTitle')} {c.boxRange}
                </p>
              </div>
              <DemoActionButton className="text-xs text-gray-400 hover:text-red-300 font-semibold">
                {t('removeCrafter')}
              </DemoActionButton>
            </li>
          ))}
        </ul>
      </section>

      {/* 진행 중인 작업 */}
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
        <h2 className="text-base font-bold text-white">{t('tasksTitle')}</h2>
        <p className="text-xs text-gray-500">{t('tasksHint')}</p>
        <ul className="space-y-2">
          {TASKS.map((task) => {
            const s = STATUS_STYLE[task.status]
            return (
              <li
                key={task.id}
                className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-3"
              >
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${s.bg} ${s.text} shrink-0`}>
                  {t(s.label)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{task.item}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {t('taskRequester', { name: task.requester })}
                    {task.crafter && ` · ${t('taskCrafter', { name: task.crafter })}`}
                    {task.box && ` · ${tDemoCraft('boxNumber', { n: task.box })}`}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tDemoCraft('ctaAdminTitle')}
        description={tDemoCraft('ctaAdminDescription')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
