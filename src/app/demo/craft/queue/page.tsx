import Image from 'next/image'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  Box,
  Hammer,
  MapPin,
  Package,
  Sparkles,
  User,
} from 'lucide-react'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import DemoActionButton from '../../_components/DemoActionButton'
import DemoCTACard from '../../_components/DemoCTACard'

// 실 /craft/queue 비주얼 클론 — 제작자 기본값 카드 + 도시 필터 + 필요 장비 집계
// + 큐 리스트. 실 페이지는 CraftQueueClient (use client, 체크박스/다이얼로그) +
// CraftQueueAggregationCard 조합. 정적 SSR 마크업으로 핵심 UI 만 옮겼다.

type QueueRow = {
  taskId: string
  requester: string
  role: 'tank' | 'dps' | 'healer' | 'caller' | 'support'
  city: 'fortsterling' | 'lymhurst' | 'martlock' | 'bridgewatch' | 'thetford' | 'caerleon'
  pieces: ReadonlyArray<{ itemId: string; label: string; qty: number; enchant: number }>
  silver: string
}

const ROLE_BADGE: Record<QueueRow['role'], { bg: string; text: string; labelKo: string }> = {
  tank: { bg: 'bg-amber-500/15', text: 'text-amber-300', labelKo: '탱커' },
  dps: { bg: 'bg-rose-500/15', text: 'text-rose-300', labelKo: '딜러' },
  healer: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', labelKo: '힐러' },
  caller: { bg: 'bg-violet-500/15', text: 'text-violet-300', labelKo: '콜러' },
  support: { bg: 'bg-sky-500/15', text: 'text-sky-300', labelKo: '서포트' },
}

const CITY_BADGE: Record<QueueRow['city'], { bg: string; text: string; border: string; label: string }> = {
  fortsterling: { bg: 'bg-slate-500/15', text: 'text-slate-200', border: 'border-slate-500/40', label: 'Fort Sterling' },
  lymhurst: { bg: 'bg-emerald-500/15', text: 'text-emerald-200', border: 'border-emerald-500/40', label: 'Lymhurst' },
  martlock: { bg: 'bg-sky-500/15', text: 'text-sky-200', border: 'border-sky-500/40', label: 'Martlock' },
  bridgewatch: { bg: 'bg-amber-500/15', text: 'text-amber-200', border: 'border-amber-500/40', label: 'Bridgewatch' },
  thetford: { bg: 'bg-violet-500/15', text: 'text-violet-200', border: 'border-violet-500/40', label: 'Thetford' },
  caerleon: { bg: 'bg-rose-500/15', text: 'text-rose-200', border: 'border-rose-500/40', label: 'Caerleon' },
}

const QUEUED: ReadonlyArray<QueueRow> = [
  {
    taskId: 'q1',
    requester: DEMO_MEMBERS[3].ign,
    role: 'tank',
    city: 'bridgewatch',
    pieces: [
      { itemId: 'T8_2H_MACE_HEAVY', label: 'Heavy Mace', qty: 1, enchant: 3 },
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
      { itemId: 'T8_2H_HOLYSTAFF_AVALON', label: 'Holy Staff (Avalon)', qty: 1, enchant: 3 },
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
      { itemId: 'T8_OFF_TOWERSHIELD_AVALON', label: 'Stalwart Shield', qty: 1, enchant: 2 },
    ],
    silver: '1.3M',
  },
  {
    taskId: 'q5',
    requester: DEMO_MEMBERS[2].ign,
    role: 'support',
    city: 'fortsterling',
    pieces: [
      { itemId: 'T8_CAPE_KEEPER', label: 'Keeper Cape', qty: 1, enchant: 2 },
      { itemId: 'T8_OFF_HORN_KEEPER', label: 'Battle Horn', qty: 1, enchant: 2 },
    ],
    silver: '0.6M',
  },
]

const AGGREGATE: ReadonlyArray<{ itemId: string; label: string; tier: number; enchant: number; count: number; stock: number }> = [
  { itemId: 'T8_2H_MACE_HEAVY', label: 'Heavy Mace', tier: 8, enchant: 3, count: 1, stock: 0 },
  { itemId: 'T8_2H_HOLYSTAFF_AVALON', label: 'Holy Staff (Avalon)', tier: 8, enchant: 3, count: 1, stock: 2 },
  { itemId: 'T8_2H_DAGGERPAIR', label: 'Dagger Pair', tier: 8, enchant: 3, count: 1, stock: 1 },
  { itemId: 'T8_2H_CROSSBOWLARGE', label: 'Heavy Crossbow', tier: 8, enchant: 3, count: 1, stock: 0 },
  { itemId: 'T8_ARMOR_PLATE_KEEPER', label: 'Guardian Armor', tier: 8, enchant: 3, count: 1, stock: 4 },
  { itemId: 'T8_HEAD_PLATE_KEEPER', label: 'Guardian Helmet', tier: 8, enchant: 3, count: 1, stock: 6 },
  { itemId: 'T8_SHOES_PLATE_KEEPER', label: 'Guardian Boots', tier: 8, enchant: 3, count: 1, stock: 3 },
  { itemId: 'T8_ARMOR_CLOTH_HELL', label: 'Hellion Jacket', tier: 8, enchant: 3, count: 1, stock: 2 },
  { itemId: 'T8_CAPE_KEEPER', label: 'Keeper Cape', tier: 8, enchant: 2, count: 1, stock: 0 },
]

const CITIES: ReadonlyArray<QueueRow['city']> = ['bridgewatch', 'lymhurst', 'martlock', 'fortsterling', 'thetford', 'caerleon']

function itemUrl(itemId: string, enchant: number): string {
  const q = enchant > 0 ? `?quality=3&enchantment=${enchant}` : '?quality=3'
  return `https://render.albiononline.com/v1/item/${itemId}.png${q}`
}

function stockBadgeStyle(stock: number, needed: number): string {
  if (stock >= needed) return 'text-emerald-300 bg-emerald-500/10 border border-emerald-500/30'
  if (stock > 0) return 'text-amber-300 bg-amber-500/10 border border-amber-500/30'
  return 'text-gray-500 bg-gray-950 border border-gray-800'
}

export default async function DemoCraftQueuePage() {
  const [t, tDemoMe, tDemoCraft, tCta] = await Promise.all([
    getTranslations('craftQueue'),
    getTranslations('demo.me'),
    getTranslations('demo.craft'),
    getTranslations('demo.ctaCard'),
  ])

  const myClaimedCount = 2

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
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

      {/* 제작자 기본값 카드 */}
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-2">
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

      {/* 도시 필터 */}
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{t('cityFilter.title')}</p>
          <p className="text-[10px] text-gray-500 font-mono">
            {t('cityFilter.matchCount', { matched: QUEUED.length, total: QUEUED.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CITIES.map((city) => {
            const b = CITY_BADGE[city]
            return (
              <DemoActionButton
                key={city}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${b.bg} ${b.text} border ${b.border} hover:opacity-80`}
              >
                <MapPin size={10} />
                {b.label}
              </DemoActionButton>
            )
          })}
        </div>
      </div>

      {/* 필요 장비 집계 */}
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
        <header className="space-y-1">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Package size={16} className="text-amber-400" />
            {t('aggregateTitle')}
            <span className="text-xs text-gray-500">
              {t('aggregateTaskCount', { count: QUEUED.length })}
            </span>
          </h2>
          <p className="text-[11px] text-gray-500">{t('aggregateHint')}</p>
        </header>
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{t('aggregateItemsTitle')}</p>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AGGREGATE.map((item) => (
            <li key={item.itemId} className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2">
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
                  <span className="text-gray-300 font-mono">T{item.tier}</span>
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
      </section>

      {/* 대기 중인 작업 */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Hammer size={16} className="text-amber-400" />
          {t('queueTitle')}
          <span className="text-xs text-gray-500">({QUEUED.length})</span>
        </h2>

        {/* 일괄 액션 바 */}
        <div className="flex items-center justify-between bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <DemoActionButton
              asDiv
              className="inline-flex items-center justify-center w-4 h-4 border border-gray-600 rounded cursor-pointer hover:border-amber-400"
              ariaLabel={t('selectAllLabel')}
            >
              {' '}
            </DemoActionButton>
            <span>{t('selectAllLabel')}</span>
          </div>
          <DemoActionButton className="text-xs font-bold bg-gray-800 text-gray-400 rounded-lg px-3 py-1.5 cursor-not-allowed">
            {t('bulkClaimButton', { count: 0 })}
          </DemoActionButton>
        </div>

        <ul className="space-y-3">
          {QUEUED.map((row) => {
            const role = ROLE_BADGE[row.role]
            const city = CITY_BADGE[row.city]
            return (
              <li key={row.taskId} className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <DemoActionButton
                    asDiv
                    className="mt-1 w-4 h-4 border border-gray-600 rounded cursor-pointer hover:border-amber-400 flex-shrink-0"
                    ariaLabel={t('selectTask')}
                  >
                    {' '}
                  </DemoActionButton>
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Task Header */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
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
                            <span className="text-gray-400">· {row.silver}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Build Preview */}
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
                      <DemoActionButton className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2">
                        {t('detailButton')}
                      </DemoActionButton>
                      <DemoActionButton className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-lg px-3 py-2">
                        {t('claimButton')}
                      </DemoActionButton>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
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
