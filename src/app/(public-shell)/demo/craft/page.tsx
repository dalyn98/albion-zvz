'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
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
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'

// 실 /admin/dashboard/craft 의 비주얼 클론 — 데모용 클라이언트 상태로 토글 / 박스 범위 /
// 만료일 / 제작자 삭제를 실제로 반영. 페이지 리로드 시 초기화.

interface Crafter {
  ign: string
  mode: 'paid' | 'volunteer'
  premium: number
  boxRange: string
}

const INITIAL_CRAFTERS: Crafter[] = DEMO_MEMBERS.slice(0, 3).map((m, idx) => ({
  ign: m.ign,
  mode: idx === 1 ? 'volunteer' : 'paid',
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
const CRAFT_ADMIN_TOUR_STEPS = [
  { id: 'craft-admin-links' },
  { id: 'craft-admin-settings' },
  { id: 'craft-admin-crafters' },
  { id: 'craft-admin-tasks' },
] as const

const STATUS_STYLE: Record<typeof TASKS[number]['status'], { bg: string; text: string; label: 'status_queued' | 'status_claimed' | 'status_delivered' }> = {
  queued: { bg: 'bg-gray-700/40', text: 'text-gray-300', label: 'status_queued' },
  claimed: { bg: 'bg-amber-500/15', text: 'text-amber-300', label: 'status_claimed' },
  delivered: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', label: 'status_delivered' },
}

export default function DemoCraftAdminPage() {
  const t = useTranslations('adminCraft')
  const tDemoMe = useTranslations('demo.me')
  const tDemoCraft = useTranslations('demo.craft')
  const tCta = useTranslations('demo.ctaCard')

  const [enabled, setEnabled] = useState(true)
  const [rangeMin, setRangeMin] = useState(1)
  const [rangeMax, setRangeMax] = useState(30)
  const [expiryDays, setExpiryDays] = useState(7)
  const [crafters, setCrafters] = useState<Crafter[]>(INITIAL_CRAFTERS)

  const removeCrafter = (ign: string) => {
    setCrafters((prev) => prev.filter((c) => c.ign !== ign))
  }

  // 설정 토글/범위가 실제 작업 노출에 영향을 주도록 — 비활성화면 모두 숨김,
  // 활성화면 큐(box=null) 는 항상 + 진행 중 작업은 박스 번호가 범위 안에 있을 때만.
  const visibleTasks = useMemo(() => {
    if (!enabled) return [] as typeof TASKS
    return TASKS.filter(
      (task) => task.box === null || (task.box >= rangeMin && task.box <= rangeMax),
    )
  }, [enabled, rangeMin, rangeMax])

  return (
    <div className="space-y-5">
      <DemoGuidedTour steps={CRAFT_ADMIN_TOUR_STEPS} namespace="craftAdmin" />
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
      <div data-tour-id="craft-admin-links" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
      <section data-tour-id="craft-admin-settings" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ToggleRight size={16} className={enabled ? 'text-emerald-400' : 'text-gray-500'} />
          {t('settingsTitle')}
        </h2>
        <p className="text-xs text-gray-500">{t('settingsHint')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-white text-sm font-semibold">{t('enabledLabel')}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{t('enabledHint')}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 rounded-full border cursor-pointer shrink-0 transition-colors ${
                enabled
                  ? 'bg-emerald-500/40 border-emerald-500/60'
                  : 'bg-gray-700/50 border-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full shadow transition-[background-color,left,right] duration-150 ease-out ${
                  enabled ? 'right-0.5 bg-emerald-300' : 'left-0.5 bg-gray-400'
                }`}
              />
            </button>
          </div>

          <div
            aria-disabled={!enabled || undefined}
            className={`relative rounded-lg p-3 space-y-2 transition-colors ${
              enabled
                ? 'bg-gray-950 border border-gray-800'
                : 'bg-gray-950/40 border border-dashed border-gray-700/60 opacity-60 grayscale [&_input]:cursor-not-allowed'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-semibold ${enabled ? 'text-white' : 'text-gray-500'}`}>
                {t('rangeMinLabel')} / {t('rangeMaxLabel')}
              </p>
              {!enabled && (
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                  off
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={rangeMax}
                value={rangeMin}
                disabled={!enabled}
                onChange={(e) => setRangeMin(Math.max(1, Number(e.target.value) || 1))}
                className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed"
              />
              <span className="text-gray-500">~</span>
              <input
                type="number"
                min={rangeMin}
                max={99}
                value={rangeMax}
                disabled={!enabled}
                onChange={(e) => setRangeMax(Math.min(99, Number(e.target.value) || rangeMin))}
                className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 font-mono focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <label htmlFor="demo-craft-expiry" className="text-[11px] text-gray-500">
                {t('expiryDaysLabel')}
              </label>
              <input
                id="demo-craft-expiry"
                type="number"
                min={1}
                max={90}
                value={expiryDays}
                disabled={!enabled}
                onChange={(e) => setExpiryDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-200 font-mono focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 제작자 권한 */}
      <section data-tour-id="craft-admin-crafters" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Crown size={16} className="text-amber-400" />
          {t('craftersTitle')}
        </h2>
        <p className="text-xs text-gray-500">{t('craftersHint')}</p>
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
          {t('craftersListTitle', { count: crafters.length })}
        </p>
        {crafters.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">
            {tDemoCraft('craftersEmpty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {crafters.map((c) => (
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
                <button
                  type="button"
                  onClick={() => removeCrafter(c.ign)}
                  className="text-xs text-gray-400 hover:text-red-300 font-semibold transition-colors"
                >
                  {t('removeCrafter')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 진행 중인 작업 */}
      <section data-tour-id="craft-admin-tasks" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
        <h2 className="text-base font-bold text-white">{t('tasksTitle')}</h2>
        <p className="text-xs text-gray-500">{t('tasksHint')}</p>
        {!enabled ? (
          <p className="text-gray-500 text-sm text-center py-6 bg-gray-950 border border-gray-800 rounded-lg">
            {tDemoCraft('tasksDisabledNotice')}
          </p>
        ) : visibleTasks.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6 bg-gray-950 border border-gray-800 rounded-lg">
            {tDemoCraft('tasksRangeEmpty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleTasks.map((task) => {
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
        )}
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
