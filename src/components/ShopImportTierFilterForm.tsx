'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Filter, RotateCcw, Save } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import {
  TIER_ENCHANT_SUM_MAX,
  TIER_ENCHANT_SUM_MIN,
} from '@/lib/shop/import-tier-enchant-filter'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initialExcludeAtOrBelow: string
  initialExcludeAtOrAbove: string
}

interface ParsedBound {
  value: number | null
  valid: boolean
}

function parseOptionalBound(value: string): ParsedBound {
  const trimmed = value.trim()
  if (!trimmed) return { value: null, valid: true }
  const parsed = Number(trimmed)
  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < TIER_ENCHANT_SUM_MIN ||
    parsed > TIER_ENCHANT_SUM_MAX
  ) {
    return { value: null, valid: false }
  }
  return { value: parsed, valid: true }
}

function normalizeInitial(value: string): string {
  const parsed = parseOptionalBound(value)
  return parsed.valid && parsed.value !== null ? String(parsed.value) : ''
}

export default function ShopImportTierFilterForm({
  initialExcludeAtOrBelow,
  initialExcludeAtOrAbove,
}: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const t = useTranslations('adminShopImportFilter')
  const initialLte = normalizeInitial(initialExcludeAtOrBelow)
  const initialGte = normalizeInitial(initialExcludeAtOrAbove)
  const [excludeAtOrBelow, setExcludeAtOrBelow] = useState(initialLte)
  const [excludeAtOrAbove, setExcludeAtOrAbove] = useState(initialGte)
  const [savedLte, setSavedLte] = useState(initialLte)
  const [savedGte, setSavedGte] = useState(initialGte)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const lte = parseOptionalBound(excludeAtOrBelow)
  const gte = parseOptionalBound(excludeAtOrAbove)
  const hasValidWindow =
    lte.value === null || gte.value === null || lte.value < gte.value
  const isValid = lte.valid && gte.valid && hasValidWindow
  const dirty = excludeAtOrBelow.trim() !== savedLte || excludeAtOrAbove.trim() !== savedGte
  useReportDirty('shop-import-tier-filter', dirty)

  const previewText = (() => {
    if (!lte.valid || !gte.valid) return t('invalidRange')
    if (!hasValidWindow) return t('invalidWindow')
    if (lte.value !== null && gte.value !== null) {
      return t('previewBoth', { lte: lte.value, gte: gte.value })
    }
    if (lte.value !== null) return t('previewLte', { lte: lte.value })
    if (gte.value !== null) return t('previewGte', { gte: gte.value })
    return t('previewDisabled')
  })()

  const handleSave = () => {
    if (!dirty || !isValid) return
    setError('')
    setSaved(false)
    startTransition(async () => {
      const nextLte = lte.value === null ? '' : String(lte.value)
      const nextGte = gte.value === null ? '' : String(gte.value)

      if (nextLte !== savedLte) {
        const result = await updateAppSetting(
          'shop_import_exclude_tier_enchant_sum_lte',
          nextLte,
        )
        if (result.error) {
          setError(result.error)
          return
        }
      }
      if (nextGte !== savedGte) {
        const result = await updateAppSetting(
          'shop_import_exclude_tier_enchant_sum_gte',
          nextGte,
        )
        if (result.error) {
          setError(result.error)
          return
        }
      }

      setExcludeAtOrBelow(nextLte)
      setExcludeAtOrAbove(nextGte)
      setSavedLte(nextLte)
      setSavedGte(nextGte)
      setSaved(true)
      router.refresh()
    })
  }

  const handleClear = () => {
    setExcludeAtOrBelow('')
    setExcludeAtOrAbove('')
    setSaved(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Filter size={16} className="mt-0.5 text-amber-400" />
        <div>
          <h2 className="font-bold text-white">{t('title')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            {t('description')}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-3">
          <span className="block text-xs font-semibold text-white">
            {t('lteLabel')}
          </span>
          <span className="mt-0.5 block min-h-8 text-[11px] leading-relaxed text-gray-500">
            {t('lteHint')}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={excludeAtOrBelow}
            onChange={(e) => {
              setExcludeAtOrBelow(e.target.value)
              setSaved(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
            placeholder={t('ltePlaceholder')}
            disabled={pending}
            className="mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-right font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
          />
        </label>
        <label className="block rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-3">
          <span className="block text-xs font-semibold text-white">
            {t('gteLabel')}
          </span>
          <span className="mt-0.5 block min-h-8 text-[11px] leading-relaxed text-gray-500">
            {t('gteHint')}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={excludeAtOrAbove}
            onChange={(e) => {
              setExcludeAtOrAbove(e.target.value)
              setSaved(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
            }}
            placeholder={t('gtePlaceholder')}
            disabled={pending}
            className="mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-right font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
          />
        </label>
      </div>

      <p className={`text-[11px] ${isValid ? 'text-gray-500' : 'text-red-300'}`}>
        {previewText}
      </p>
      <p className="text-[11px] text-gray-600">
        {t('rangeHint', { min: TIER_ENCHANT_SUM_MIN, max: TIER_ENCHANT_SUM_MAX })}
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !dirty || !isValid}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500"
        >
          <Save size={14} />
          {pending ? tc('saving') : tc('save')}
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={pending || (!excludeAtOrBelow && !excludeAtOrAbove)}
          className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-white disabled:text-gray-700"
        >
          <RotateCcw size={12} />
          {t('clear')}
        </button>
        {saved && !dirty && (
          <span className="text-[11px] text-emerald-400">{tc('saved')}</span>
        )}
      </div>
    </div>
  )
}
