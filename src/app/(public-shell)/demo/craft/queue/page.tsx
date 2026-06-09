'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Box,
  Hammer,
  MapPin,
  Package,
  Sparkles,
  User,
} from 'lucide-react'
import AlbionItemImage from '@/components/AlbionItemImage'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import DemoActionButton from '../../_components/DemoActionButton'
import DemoCTACard from '../../_components/DemoCTACard'
import DemoGuidedTour from '../../_components/DemoGuidedTour'
import { useDemoToast } from '../../_components/DemoFeedbackProvider'

// 실 /craft/queue 비주얼 클론을 클라이언트 컴포넌트로 전환. 도시 필터, 일괄 선택,
// 개별/일괄 잡기까지 실제 state 가 움직이고 토스트가 뜬다. 잡힌 작업은 즉시 큐에서
// 사라지고 집계 카드도 함께 줄어든다. 페이지 리로드 시 초기 상태로 돌아간다.

type City = 'fortsterling' | 'lymhurst' | 'martlock' | 'bridgewatch' | 'thetford' | 'caerleon'

interface QueueRow {
  taskId: string
  requester: string
  role: 'tank' | 'dps' | 'healer' | 'caller' | 'support'
  city: City
  pieces: ReadonlyArray<{ itemId: string; label: string; qty: number; enchant: number }>
  silver: string
}

type CraftRoleLabelKey = 'roleTank' | 'roleDps' | 'roleHealer' | 'roleCaller' | 'roleSupport'

const ROLE_BADGE: Record<QueueRow['role'], { bg: string; text: string; labelKey: CraftRoleLabelKey }> = {
  tank: { bg: 'bg-amber-500/15', text: 'text-amber-300', labelKey: 'roleTank' },
  dps: { bg: 'bg-rose-500/15', text: 'text-rose-300', labelKey: 'roleDps' },
  healer: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', labelKey: 'roleHealer' },
  caller: { bg: 'bg-violet-500/15', text: 'text-violet-300', labelKey: 'roleCaller' },
  support: { bg: 'bg-sky-500/15', text: 'text-sky-300', labelKey: 'roleSupport' },
}

const CITY_BADGE: Record<City, { bg: string; text: string; border: string; label: string }> = {
  fortsterling: { bg: 'bg-slate-500/15', text: 'text-slate-200', border: 'border-slate-500/40', label: 'Fort Sterling' },
  lymhurst: { bg: 'bg-emerald-500/15', text: 'text-emerald-200', border: 'border-emerald-500/40', label: 'Lymhurst' },
  martlock: { bg: 'bg-sky-500/15', text: 'text-sky-200', border: 'border-sky-500/40', label: 'Martlock' },
  bridgewatch: { bg: 'bg-amber-500/15', text: 'text-amber-200', border: 'border-amber-500/40', label: 'Bridgewatch' },
  thetford: { bg: 'bg-violet-500/15', text: 'text-violet-200', border: 'border-violet-500/40', label: 'Thetford' },
  caerleon: { bg: 'bg-rose-500/15', text: 'text-rose-200', border: 'border-rose-500/40', label: 'Caerleon' },
}

const INITIAL_QUEUE: ReadonlyArray<QueueRow> = [
  {
    taskId: 'q1',
    requester: DEMO_MEMBERS[3].ign,
    role: 'tank',
    city: 'bridgewatch',
    pieces: [
      { itemId: 'T8_2H_MACE', label: 'Heavy Mace', qty: 1, enchant: 3 },
      { itemId: 'T8_ARMOR_PLATE_KEEPER', label: 'Guardian Armor', qty: 1, enchant: 3 },
      { itemId: 'T8_HEAD_PLATE_KEEPER', label: 'Guardian Helmet', qty: 1, enchant: 3 },
      { itemId: 'T8_SHOES_PLATE_KEEPER', label: 'Guardian Boots', qty: 1, enchant: 3 },
    ],
    silver: '1.8M',
  },
  {
    taskId: 'q2',
    requester: DEMO_MEMBERS[5].ign,
    role: 'healer',
    city: 'lymhurst',
    pieces: [
      { itemId: 'T8_MAIN_HOLYSTAFF_AVALON', label: 'Hallowfall', qty: 1, enchant: 3 },
      { itemId: 'T8_ARMOR_CLOTH_HELL', label: 'Hellion Jacket', qty: 1, enchant: 3 },
      { itemId: 'T8_HEAD_CLOTH_HELL', label: 'Hellion Hood', qty: 1, enchant: 2 },
    ],
    silver: '1.4M',
  },
  {
    taskId: 'q3',
    requester: DEMO_MEMBERS[4].ign,
    role: 'dps',
    city: 'martlock',
    pieces: [
      { itemId: 'T8_2H_DAGGERPAIR', label: 'Dagger Pair', qty: 1, enchant: 3 },
      { itemId: 'T8_ARMOR_LEATHER_HELL', label: 'Hellion Jacket (Leather)', qty: 1, enchant: 3 },
    ],
    silver: '1.1M',
  },
  {
    taskId: 'q4',
    requester: DEMO_MEMBERS[7].ign,
    role: 'dps',
    city: 'thetford',
    pieces: [
      { itemId: 'T8_2H_CROSSBOWLARGE', label: 'Heavy Crossbow', qty: 1, enchant: 3 },
      { itemId: 'T8_OFF_SHIELD', label: 'Shield', qty: 1, enchant: 2 },
    ],
    silver: '1.3M',
  },
  {
    taskId: 'q5',
    requester: DEMO_MEMBERS[2].ign,
    role: 'support',
    city: 'fortsterling',
    pieces: [
      { itemId: 'T8_CAPEITEM_KEEPER', label: 'Keeper Cape', qty: 1, enchant: 2 },
      { itemId: 'T8_OFF_HORN_KEEPER', label: 'Battle Horn', qty: 1, enchant: 2 },
    ],
    silver: '0.6M',
  },
]

const CITIES: ReadonlyArray<City> = ['bridgewatch', 'lymhurst', 'martlock', 'fortsterling', 'thetford', 'caerleon']
const CRAFT_QUEUE_TOUR_STEPS = [
  { id: 'craft-queue-defaults' },
  { id: 'craft-queue-filter' },
  { id: 'craft-queue-list' },
  { id: 'craft-queue-aggregate' },
] as const

// 베이스 재고 — 잡힌 작업만큼 needed 가 줄어들고 부족 여부도 다시 계산됨.
const BASE_STOCK: Record<string, number> = {
  T8_2H_MACE: 0,
  T8_MAIN_HOLYSTAFF_AVALON: 2,
  T8_2H_DAGGERPAIR: 1,
  T8_2H_CROSSBOWLARGE: 0,
  T8_ARMOR_PLATE_KEEPER: 4,
  T8_HEAD_PLATE_KEEPER: 6,
  T8_SHOES_PLATE_KEEPER: 3,
  T8_ARMOR_CLOTH_HELL: 2,
  T8_HEAD_CLOTH_HELL: 1,
  T8_ARMOR_LEATHER_HELL: 1,
  T8_OFF_SHIELD: 0,
  T8_CAPEITEM_KEEPER: 0,
  T8_OFF_HORN_KEEPER: 1,
}

function itemUrl(itemId: string, enchant: number): string {
  const q = enchant > 0 ? `?quality=3&enchantment=${enchant}` : '?quality=3'
  return `https://render.albiononline.com/v1/item/${itemId}.png${q}`
}

function stockBadgeStyle(stock: number, needed: number): string {
  if (stock >= needed) return 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/30'
  if (stock > 0) return 'text-amber-300 bg-amber-500/10 border border-amber-500/30'
  return 'text-gray-500 bg-gray-950 border border-gray-800'
}

interface AggregateRow {
  itemId: string
  label: string
  enchant: number
  count: number
  stock: number
}

function aggregate(rows: ReadonlyArray<QueueRow>): AggregateRow[] {
  const map = new Map<string, AggregateRow>()
  for (const r of rows) {
    for (const p of r.pieces) {
      const key = `${p.itemId}@${p.enchant}`
      const existing = map.get(key)
      if (existing) {
        existing.count += p.qty
      } else {
        map.set(key, {
          itemId: p.itemId,
          label: p.label,
          enchant: p.enchant,
          count: p.qty,
          stock: BASE_STOCK[p.itemId] ?? 0,
        })
      }
    }
  }
  return Array.from(map.values())
}

export default function DemoCraftQueuePage() {
  const t = useTranslations('craftQueue')
  const tDemoMe = useTranslations('demo.me')
  const tDemoCraft = useTranslations('demo.craft')
  const tCta = useTranslations('demo.ctaCard')
  const tFeedback = useTranslations('demo.feedback')
  const { showToast } = useDemoToast()

  const [queue, setQueue] = useState<ReadonlyArray<QueueRow>>(INITIAL_QUEUE)
  const [cityFilter, setCityFilter] = useState<ReadonlySet<City>>(new Set())
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const visibleQueue = useMemo(() => {
    if (cityFilter.size === 0) return queue
    return queue.filter((row) => cityFilter.has(row.city))
  }, [queue, cityFilter])

  const aggregateRows = useMemo(() => aggregate(visibleQueue), [visibleQueue])

  // 본 데모 세션에서 잡은 작업 수 — my-tasks 페이지에 표시될 초기치(2) 에 합산.
  const claimedInSession = INITIAL_QUEUE.length - queue.length
  const myClaimedCount = 2 + claimedInSession

  const toggleCity = (city: City) => {
    setCityFilter((prev) => {
      const next = new Set(prev)
      if (next.has(city)) next.delete(city)
      else next.add(city)
      return next
    })
  }

  const clearCityFilter = () => setCityFilter(new Set())

  const toggleSelect = (taskId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const allVisible = visibleQueue.map((r) => r.taskId)
      const everySelected = allVisible.length > 0 && allVisible.every((id) => prev.has(id))
      if (everySelected) return new Set()
      return new Set(allVisible)
    })
  }

  const claimOne = (taskId: string) => {
    setQueue((prev) => prev.filter((r) => r.taskId !== taskId))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
    showToast(t('toastClaimed'))
  }

  const claimBulk = () => {
    if (selected.size === 0) return
    const count = selected.size
    setQueue((prev) => prev.filter((r) => !selected.has(r.taskId)))
    setSelected(new Set())
    showToast(t('bulkClaimDone', { ok: count }))
  }

  const matchCount = visibleQueue.length
  const totalCount = queue.length
  const allVisibleSelected =
    visibleQueue.length > 0 && visibleQueue.every((r) => selected.has(r.taskId))

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <DemoGuidedTour steps={CRAFT_QUEUE_TOUR_STEPS} namespace="craftQueue" />
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <Hammer size={20} className="text-amber-400" />
            {t('pageTitle')}
          </h1>
          <p className="text-gray-400 text-sm">{t('pageDescription')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemoCraft('queueNotice')}</p>
      </div>

      <Link
        href="/demo/craft/my-tasks"
        className="flex items-center gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-2xl px-4 py-3 transition-colors"
      >
        <Box size={18} className="text-emerald-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t('myTasksLinkTitle')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{t('myTasksLinkHint', { count: myClaimedCount })}</p>
        </div>
        <span className="text-xs text-amber-300 flex-shrink-0">{t('myTasksLinkAction')}</span>
      </Link>

      {/* 제작자 기본값 카드 — 편집 버튼은 토스트 안내 */}
      <section data-tour-id="craft-queue-defaults" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-2">
        <h2 className="text-base font-bold text-white">{t('defaultsTitle')}</h2>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-gray-300">
            {t('defaultsCurrent', { mode: t('modePaid'), premium: 15 })}
          </p>
          <DemoActionButton className="text-xs text-amber-300 hover:text-amber-200 border border-amber-500/40 hover:border-amber-400 rounded-lg px-3 py-1.5">
            {t('edit')}
          </DemoActionButton>
        </div>
        <p className="text-[11px] text-gray-500">{t('boxRangeAssigned', { start: 1, end: 10 })}</p>
      </section>

      {/* 도시 필터 — 실제로 멀티 토글 */}
      <div data-tour-id="craft-queue-filter" className="bg-gray-900 border border-gray-700 rounded-2xl p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{t('cityFilter.title')}</p>
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-gray-500 font-mono">
              {t('cityFilter.matchCount', { matched: matchCount, total: totalCount })}
            </p>
            {cityFilter.size > 0 && (
              <button
                type="button"
                onClick={clearCityFilter}
                className="text-[11px] text-amber-300 hover:text-amber-200 underline"
              >
                {t('cityFilter.clear')}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CITIES.map((city) => {
            const b = CITY_BADGE[city]
            const active = cityFilter.has(city)
            return (
              <button
                key={city}
                type="button"
                onClick={() => toggleCity(city)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${b.bg} ${b.text} border ${b.border} transition-opacity ${
                  active ? 'ring-2 ring-amber-400/60' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <MapPin size={10} />
                {b.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 대기 중인 작업 */}
      <section data-tour-id="craft-queue-list" className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Hammer size={16} className="text-amber-400" />
          {t('queueTitle')}
          <span className="text-xs text-gray-500">({visibleQueue.length})</span>
        </h2>

        {visibleQueue.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8 bg-gray-900 border border-gray-700 rounded-2xl">
            {cityFilter.size > 0 ? t('queueEmptyFiltered') : t('queueEmpty')}
          </p>
        ) : (
          <>
            {/* 일괄 액션 바 — 실제 선택/일괄 잡기 */}
            <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 flex-wrap gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                  aria-label={t('selectAllLabel')}
                />
                <span>{t('selectAllLabel')}</span>
              </label>
              <button
                type="button"
                onClick={claimBulk}
                disabled={selected.size === 0}
                className={`text-xs font-bold rounded-lg px-3 py-1.5 transition-colors ${
                  selected.size === 0
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-black'
                }`}
              >
                {t('bulkClaimButton', { count: selected.size })}
              </button>
            </div>

            <ul className="space-y-3">
              {visibleQueue.map((row) => {
                const role = ROLE_BADGE[row.role]
                const city = CITY_BADGE[row.city]
                const isSelected = selected.has(row.taskId)
                return (
                  <li key={row.taskId} className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(row.taskId)}
                        className="mt-1 w-4 h-4 accent-amber-500 cursor-pointer flex-shrink-0"
                        aria-label={t('selectTask')}
                      />
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="w-7 h-7 rounded-full bg-gray-800 text-gray-300 flex items-center justify-center shrink-0">
                              <User size={14} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{t('requesterLine', { name: row.requester })}</p>
                              <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${role.bg} ${role.text}`}>{tDemoCraft(role.labelKey)}</span>
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${city.bg} ${city.text} border ${city.border}`}>
                                  <MapPin size={9} />
                                  {city.label}
                                </span>
                                <span className="text-gray-400">· {row.silver}</span>
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {row.pieces.map((p) => (
                            <div key={p.itemId} className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2">
                              <AlbionItemImage
                                src={itemUrl(p.itemId, p.enchant)}
                                alt={p.label}
                                width={28}
                                height={28}
                                className="shrink-0"
                              />
                              <div className="min-w-0">
                                <p className="text-[10px] text-white truncate">{p.label}</p>
                                {p.enchant > 0 && (
                                  <p className="text-[9px] text-emerald-400 font-mono">+{p.enchant}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => showToast(tFeedback('actionAcknowledged'))}
                            className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2"
                          >
                            {t('detailButton')}
                          </button>
                          <button
                            type="button"
                            onClick={() => claimOne(row.taskId)}
                            className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-lg px-3 py-2"
                          >
                            {t('claimButton')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      {/* 필요 장비 집계 */}
      <section data-tour-id="craft-queue-aggregate" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
        <header className="space-y-1">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Package size={16} className="text-amber-400" />
            {t('aggregateTitle')}
            <span className="text-xs text-gray-500">
              {t('aggregateTaskCount', { count: visibleQueue.length })}
            </span>
          </h2>
          <p className="text-[11px] text-gray-500">{t('aggregateHint')}</p>
        </header>
        {aggregateRows.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{t('queueEmpty')}</p>
        ) : (
          <>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{t('aggregateItemsTitle')}</p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {aggregateRows.map((item) => (
                <li key={`${item.itemId}-${item.enchant}`} className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2">
                  <AlbionItemImage
                    src={itemUrl(item.itemId, item.enchant)}
                    alt={item.label}
                    width={32}
                    height={32}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white truncate">{item.label}</p>
                    <p className="text-[10px] text-gray-500 flex items-center gap-1 flex-wrap">
                      <span className="text-gray-300 font-mono">T8</span>
                      {item.enchant > 0 && (
                        <span className="text-emerald-400 font-mono">{t('aggregateEnchantLabel', { level: item.enchant })}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className="text-amber-300 font-bold font-mono text-sm">×{item.count}</span>
                    <span className={`text-[10px] font-mono px-1 rounded leading-none py-0.5 ${stockBadgeStyle(item.stock, item.count)}`}>
                      {t('aggregateStockBadge', { count: item.stock })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tDemoCraft('ctaCrafterTitle')}
        description={tDemoCraft('ctaCrafterDescription')}
        buttonLabel={tCta('buttonLabel')}
      />
    </main>
  )
}
