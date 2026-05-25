'use client'

import Image from 'next/image'
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
import { DEMO_MEMBERS } from '@/data/demo-seed'
import DemoCTACard from '../../_components/DemoCTACard'
import DemoGuidedTour from '../../_components/DemoGuidedTour'
import { useDemoToast } from '../../_components/DemoFeedbackProvider'

// 실 /craft/my-tasks 비주얼 클론을 클라이언트 컴포넌트로 전환. 잡은(claimed)
// 작업을 놓거나 납품(delivered) 으로 옮기는 흐름이 실제로 움직이고, 일괄 놓기
// 까지 지원한다. 페이지 리로드 시 초기 상태로 돌아간다.

type City = 'fortsterling' | 'lymhurst' | 'bridgewatch'
type Role = 'tank' | 'healer'
type TaskStatus = 'claimed' | 'delivered'

interface MyTask {
  taskId: string
  requester: string
  status: TaskStatus
  city: City
  role: Role
  pieces: ReadonlyArray<{ itemId: string; label: string; enchant: number }>
  boxNumber?: number
  materialSilver?: string
}

const ROLE_BADGE: Record<Role, { bg: string; text: string; labelKo: string }> = {
  tank: { bg: 'bg-amber-500/15', text: 'text-amber-300', labelKo: '탱커' },
  healer: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', labelKo: '힐러' },
}

const CITY_BADGE: Record<City, { bg: string; text: string; border: string; label: string }> = {
  fortsterling: { bg: 'bg-slate-500/15', text: 'text-slate-200', border: 'border-slate-500/40', label: 'Fort Sterling' },
  lymhurst: { bg: 'bg-emerald-500/15', text: 'text-emerald-200', border: 'border-emerald-500/40', label: 'Lymhurst' },
  bridgewatch: { bg: 'bg-amber-500/15', text: 'text-amber-200', border: 'border-amber-500/40', label: 'Bridgewatch' },
}

const INITIAL_TASKS: ReadonlyArray<MyTask> = [
  {
    taskId: 'm1',
    requester: DEMO_MEMBERS[3].ign,
    status: 'claimed',
    city: 'bridgewatch',
    role: 'tank',
    pieces: [
      { itemId: 'T8_2H_MACE', label: 'Heavy Mace', enchant: 3 },
      { itemId: 'T8_ARMOR_PLATE_KEEPER', label: 'Guardian Armor', enchant: 3 },
      { itemId: 'T8_HEAD_PLATE_KEEPER', label: 'Guardian Helmet', enchant: 3 },
      { itemId: 'T8_SHOES_PLATE_KEEPER', label: 'Guardian Boots', enchant: 3 },
    ],
  },
  {
    taskId: 'm2',
    requester: DEMO_MEMBERS[5].ign,
    status: 'claimed',
    city: 'lymhurst',
    role: 'healer',
    pieces: [
      { itemId: 'T8_MAIN_HOLYSTAFF_AVALON', label: 'Hallowfall', enchant: 3 },
      { itemId: 'T8_ARMOR_CLOTH_HELL', label: 'Hellion Jacket', enchant: 3 },
      { itemId: 'T8_HEAD_CLOTH_HELL', label: 'Hellion Hood', enchant: 2 },
    ],
  },
  {
    taskId: 'd1',
    requester: DEMO_MEMBERS[4].ign,
    status: 'delivered',
    city: 'fortsterling',
    role: 'tank',
    pieces: [
      { itemId: 'T8_2H_MACE', label: 'Heavy Mace', enchant: 3 },
      { itemId: 'T8_OFF_SHIELD', label: 'Shield', enchant: 2 },
    ],
    boxNumber: 4,
    materialSilver: '0.85M',
  },
]

const BASE_STOCK: Record<string, number> = {
  T8_2H_MACE: 0,
  T8_MAIN_HOLYSTAFF_AVALON: 2,
  T8_ARMOR_PLATE_KEEPER: 4,
  T8_HEAD_PLATE_KEEPER: 6,
  T8_SHOES_PLATE_KEEPER: 3,
  T8_ARMOR_CLOTH_HELL: 2,
  T8_HEAD_CLOTH_HELL: 1,
  T8_OFF_SHIELD: 2,
}

// 잡힌 작업의 박스 번호 시드. 납품 시 자동 배정 흉내.
const ASSIGN_BOX: Record<string, number> = {
  m1: 5,
  m2: 7,
}

const MATERIAL_HINT: Record<string, string> = {
  m1: '1.10M',
  m2: '0.95M',
}
const CRAFT_MY_TASKS_TOUR_STEPS = [
  { id: 'craft-my-aggregate' },
  { id: 'craft-my-claimed' },
  { id: 'craft-my-delivered' },
] as const

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

function aggregateClaimed(tasks: ReadonlyArray<MyTask>): AggregateRow[] {
  const map = new Map<string, AggregateRow>()
  for (const t of tasks) {
    if (t.status !== 'claimed') continue
    for (const p of t.pieces) {
      const key = `${p.itemId}@${p.enchant}`
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
      } else {
        map.set(key, {
          itemId: p.itemId,
          label: p.label,
          enchant: p.enchant,
          count: 1,
          stock: BASE_STOCK[p.itemId] ?? 0,
        })
      }
    }
  }
  return Array.from(map.values())
}

export default function DemoCraftMyTasksPage() {
  const t = useTranslations('craftQueue')
  const tDemoMe = useTranslations('demo.me')
  const tDemoCraft = useTranslations('demo.craft')
  const tCta = useTranslations('demo.ctaCard')
  const { showToast } = useDemoToast()

  const [tasks, setTasks] = useState<ReadonlyArray<MyTask>>(INITIAL_TASKS)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const claimed = useMemo(() => tasks.filter((x) => x.status === 'claimed'), [tasks])
  const delivered = useMemo(() => tasks.filter((x) => x.status === 'delivered'), [tasks])
  const aggregateRows = useMemo(() => aggregateClaimed(tasks), [tasks])

  const allClaimedSelected = claimed.length > 0 && claimed.every((c) => selected.has(c.taskId))

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
      const ids = claimed.map((c) => c.taskId)
      const all = ids.length > 0 && ids.every((id) => prev.has(id))
      if (all) return new Set()
      return new Set(ids)
    })
  }

  const releaseOne = (taskId: string) => {
    setTasks((prev) => prev.filter((x) => x.taskId !== taskId))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
    showToast(t('toastReleased'))
  }

  const deliverOne = (taskId: string) => {
    setTasks((prev) =>
      prev.map((x) =>
        x.taskId === taskId
          ? {
              ...x,
              status: 'delivered' as const,
              boxNumber: ASSIGN_BOX[taskId] ?? 1,
              materialSilver: MATERIAL_HINT[taskId] ?? '1.00M',
            }
          : x,
      ),
    )
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
    showToast(t('toastDelivered'))
  }

  const releaseBulk = () => {
    if (selected.size === 0) return
    const count = selected.size
    setTasks((prev) => prev.filter((x) => !selected.has(x.taskId)))
    setSelected(new Set())
    showToast(t('bulkReleaseDone', { ok: count }))
  }

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <DemoGuidedTour steps={CRAFT_MY_TASKS_TOUR_STEPS} namespace="craftMyTasks" />
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <Box size={20} className="text-emerald-400" />
            {t('myTasksPageTitle')}
          </h1>
          <p className="text-gray-400 text-sm">{t('myTasksPageDescription')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemoCraft('myTasksNotice')}</p>
      </div>

      <Link
        href="/demo/craft/queue"
        className="flex items-center gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-2xl px-4 py-3 transition-colors"
      >
        <Hammer size={18} className="text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t('queueLinkTitle')}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{t('queueLinkHint')}</p>
        </div>
        <span className="text-xs text-amber-300 flex-shrink-0">{t('queueLinkAction')}</span>
      </Link>

      {/* 내가 잡은 작업 재료 집계 */}
      <section data-tour-id="craft-my-aggregate" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
        <header className="space-y-1">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Package size={16} className="text-amber-400" />
            {t('aggregateMineTitle')}
            <span className="text-xs text-gray-500">
              {t('aggregateTaskCount', { count: claimed.length })}
            </span>
          </h2>
          <p className="text-[11px] text-gray-500">{t('aggregateMineHint')}</p>
        </header>
        {aggregateRows.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{t('mineEmpty')}</p>
        ) : (
          <>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{t('aggregateItemsTitle')}</p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {aggregateRows.map((item) => (
                <li key={`${item.itemId}-${item.enchant}`} className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2">
                  <Image
                    src={itemUrl(item.itemId, item.enchant)}
                    alt={item.label}
                    width={32}
                    height={32}
                    className="shrink-0"
                    unoptimized
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

      {/* 내가 잡은 작업 */}
      <section data-tour-id="craft-my-claimed" className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Box size={16} className="text-emerald-400" />
          {t('mineTitle')}
          <span className="text-xs text-gray-500">({tasks.length})</span>
        </h2>

        {claimed.length === 0 && delivered.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8 bg-gray-900 border border-gray-700 rounded-2xl">
            {t('mineEmpty')}
          </p>
        ) : (
          <>
            {claimed.length > 0 && (
              <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 flex-wrap gap-2">
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allClaimedSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-rose-400 cursor-pointer"
                    aria-label={t('selectAllLabel')}
                  />
                  <span>{t('selectAllLabel')}</span>
                </label>
                <button
                  type="button"
                  onClick={releaseBulk}
                  disabled={selected.size === 0}
                  className={`text-xs font-bold rounded-lg px-3 py-1.5 transition-colors ${
                    selected.size === 0
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : 'bg-rose-500 hover:bg-rose-400 text-white'
                  }`}
                >
                  {t('bulkReleaseButton', { count: selected.size })}
                </button>
              </div>
            )}

            <ul className="space-y-3">
              {claimed.map((row) => {
                const role = ROLE_BADGE[row.role]
                const city = CITY_BADGE[row.city]
                const isSelected = selected.has(row.taskId)
                return (
                  <li key={row.taskId} className="bg-gray-900 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(row.taskId)}
                        className="mt-1 w-4 h-4 accent-rose-400 cursor-pointer flex-shrink-0"
                        aria-label={t('selectTask')}
                      />
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="w-7 h-7 rounded-full bg-gray-800 text-gray-300 flex items-center justify-center shrink-0">
                            <User size={14} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{t('requesterLine', { name: row.requester })}</p>
                            <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${role.bg} ${role.text}`}>{role.labelKo}</span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${city.bg} ${city.text} border ${city.border}`}>
                                <MapPin size={9} />
                                {city.label}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {row.pieces.map((p) => (
                            <div key={p.itemId} className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2">
                              <Image
                                src={itemUrl(p.itemId, p.enchant)}
                                alt={p.label}
                                width={28}
                                height={28}
                                className="shrink-0"
                                unoptimized
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
                            onClick={() => releaseOne(row.taskId)}
                            className="text-xs text-gray-400 hover:text-rose-300 border border-gray-700 hover:border-rose-500/40 rounded-lg px-3 py-2"
                          >
                            {t('releaseButton')}
                          </button>
                          <button
                            type="button"
                            onClick={() => deliverOne(row.taskId)}
                            className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg px-3 py-2"
                          >
                            {t('deliverButton')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}

              {delivered.map((row) => {
                const role = ROLE_BADGE[row.role]
                const city = CITY_BADGE[row.city]
                return (
                  <li key={row.taskId} data-tour-id="craft-my-delivered" className="bg-gray-900 border border-emerald-500/30 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="w-7 h-7 rounded-full bg-gray-800 text-gray-300 flex items-center justify-center shrink-0">
                        <User size={14} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{t('requesterLine', { name: row.requester })}</p>
                        <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${role.bg} ${role.text}`}>{role.labelKo}</span>
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${city.bg} ${city.text} border ${city.border}`}>
                            <MapPin size={9} />
                            {city.label}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {row.pieces.map((p) => (
                        <div key={p.itemId} className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2">
                          <Image
                            src={itemUrl(p.itemId, p.enchant)}
                            alt={p.label}
                            width={28}
                            height={28}
                            className="shrink-0"
                            unoptimized
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

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                      <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded px-2 py-0.5 font-mono">
                        {t('boxLabel', { n: row.boxNumber ?? 0 })}
                      </span>
                      {row.materialSilver && (
                        <span className="text-gray-500">· {t('materialSpent', { silver: row.materialSilver })}</span>
                      )}
                    </div>
                  </li>
                )
              })}
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
