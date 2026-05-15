import { getTranslations } from 'next-intl/server'
import { Boxes } from 'lucide-react'
import {
  loadCraftActiveMaterialStatsAdmin,
  type CraftActiveItemRow,
} from '@/app/actions/craft-stats-admin'
import { getLocale } from '@/lib/locale'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'
import ItemImage from './ItemImage'

// 어드민 제작 대시보드 — 진행 중인 작업 (queued + claimed) 의 완제품 장비 합산.
// 정련 재료 분해는 폐기 (마이그 112 + 2026-05-02 recipe 데이터 폐기) 라
// "지금 만들어야 할 itemId × 수량" 만 보여준다. 운영자는 길드 창고에서 무엇을
// 미리 빼두면 작업이 안 멈출지를 한눈에 파악.

export default async function AdminCraftMaterialsPanel() {
  const [t, locale] = await Promise.all([
    getTranslations('adminCraft'),
    getLocale(),
  ])

  const { result, error } = await loadCraftActiveMaterialStatsAdmin()

  if (error || !result) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Boxes size={16} className="text-amber-400" />
          {t('materialsTitle')}
        </h2>
        <p className="text-xs text-rose-300">{error ?? t('materialsError')}</p>
      </section>
    )
  }

  const isEmpty = result.items.length === 0

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Boxes size={16} className="text-amber-400" />
          {t('materialsTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('materialsHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Pill tone="neutral">
          {t('materialsTaskCount', { count: result.taskCount })}
        </Pill>
        <Pill tone="dim">
          {t('materialsQueued', { count: result.queuedCount })}
        </Pill>
        <Pill tone="dim">
          {t('materialsClaimed', { count: result.claimedCount })}
        </Pill>
      </div>

      {isEmpty ? (
        <p className="text-gray-500 text-sm bg-gray-950 border border-gray-800 rounded-lg px-3 py-4 text-center">
          {t('materialsEmpty')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {result.items.map((row) => (
            <ItemRow key={row.itemId} row={row} locale={locale} t={t} />
          ))}
        </ul>
      )}
    </section>
  )
}

interface ItemRowProps {
  row: CraftActiveItemRow
  locale: Locale
  t: Awaited<ReturnType<typeof getTranslations<'adminCraft'>>>
}

function ItemRow({ row, locale, t }: ItemRowProps) {
  const displayName =
    getLocalizedItemNameWithEnchant(row.itemId, locale, row.itemName) ?? row.itemId
  return (
    <li
      className="bg-gray-950 border border-gray-800 rounded-lg p-2 flex items-center gap-2"
      title={displayName}
    >
      <ItemImage itemId={row.itemId} itemName={row.itemName} size={32} hoverPreview />
      <span className="flex-1 min-w-0 text-xs text-gray-100 truncate">
        {displayName}
      </span>
      <span className="font-mono text-amber-200 text-sm whitespace-nowrap">
        {row.count.toLocaleString('en-US')}
        <span className="text-gray-500 ml-1 text-[10px]">{t('materialsUnit')}</span>
      </span>
    </li>
  )
}

interface PillProps {
  tone: 'neutral' | 'dim'
  children: React.ReactNode
}

function Pill({ tone, children }: PillProps) {
  const cls =
    tone === 'dim'
      ? 'bg-gray-950 text-gray-400 border-gray-800'
      : 'bg-gray-800 text-gray-100 border-gray-700'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border tabular-nums ${cls}`}
    >
      {children}
    </span>
  )
}
