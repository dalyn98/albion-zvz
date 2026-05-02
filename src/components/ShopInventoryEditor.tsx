'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import Image from 'next/image'
import { Package, RefreshCw, Loader2, Pencil, Check, X, Trash2, Search, RotateCcw } from 'lucide-react'
import {
  syncShopPrices,
  updateInventoryStock,
  setManualPrice,
  clearManualPrice,
  deleteInventoryRow,
  resetShopInventory,
  type PriceSyncSummary,
} from '@/app/actions/shop-inventory'
import { computePointPrice } from '@/lib/shop/price'
import { formatRelativeFine } from '@/lib/relative-time'
import { getLocalizedItemName } from '@/lib/item-names'
import type { Locale } from '@/i18n/locales'

export type InventoryPriceWarning = 'quality' | 'window' | 'bluezone' | 'redzone' | null

export interface InventoryRow {
  id: string
  uniqueName: string
  enchant: number
  quality: number
  stock: number
  nameKo: string
  category: string | null
  tier: number | null
  manualPrice: number | null
  autoPriceSilver: number | null
  priceSource: string | null
  priceWarningLevel: InventoryPriceWarning
  priceUpdatedAt: string | null
  updatedAt: string
}

type InventoryTranslator = ReturnType<typeof useTranslations<'adminShopInventory'>>
type ShopTranslator = ReturnType<typeof useTranslations<'shop'>>

// 관리자 테이블용 경고 배지 색상. 라벨과 툴팁은 i18n (shop.priceWarning* 키).
const WARNING_COLOR: Record<NonNullable<InventoryPriceWarning>, string> = {
  quality: 'bg-yellow-400 text-black',
  window: 'bg-yellow-400 text-black',
  bluezone: 'bg-orange-500 text-black',
  redzone: 'bg-red-600 text-white',
}

interface Props {
  rows: InventoryRow[]
  // 상점 할인율 (0 < rate ≤ 1). 수동/자동 가격(모두 실버) 에 곱해 최종 포인트 계산.
  discountRate: number
}

const QUALITY_KEYS = ['unknown', 'normal', 'good', 'outstanding', 'excellent', 'masterpiece'] as const
type QualityKey = (typeof QUALITY_KEYS)[number]
function qualityKey(idx: number): QualityKey {
  return QUALITY_KEYS[idx] ?? 'unknown'
}

function imageUrl(uniqueName: string, enchant: number, quality: number, size = 60): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: String(size) })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

// price_source 는 `aodp:{city}[:spot][:q{n}]` 또는 `manual`.
// - `:spot` 접미사 = avg_Nd 모드에서 history 데이터가 없어 현재가로 폴백.
// - `:q{n}` 접미사 = 요청 품질에 데이터가 없어 낮은 품질 {n} 로 폴백.
interface AodpSourceInfo {
  city: string
  isSpot: boolean
  fallbackQuality: number | null
}

function parseAodpSource(source: string | null): AodpSourceInfo | null {
  if (!source || !source.startsWith('aodp:')) return null
  const parts = source.split(':')
  const city = parts[1] ?? ''
  let isSpot = false
  let fallbackQuality: number | null = null
  for (let i = 2; i < parts.length; i += 1) {
    const p = parts[i]
    if (p === 'spot') isSpot = true
    else if (/^q\d$/.test(p)) fallbackQuality = Number(p.slice(1))
  }
  return { city, isSpot, fallbackQuality }
}

function isSpotFallback(source: string | null): boolean {
  return parseAodpSource(source)?.isSpot === true
}

function fallbackQuality(source: string | null): number | null {
  return parseAodpSource(source)?.fallbackQuality ?? null
}

function priceSourceTooltip(source: string | null, t: InventoryTranslator, tShop: ShopTranslator): string {
  if (!source) return t('priceSourceEmpty')
  if (source === 'manual') return t('priceSourceManualLocked')
  const info = parseAodpSource(source)
  if (info) {
    const extras: string[] = []
    if (info.isSpot) extras.push(t('priceSourceSpot'))
    if (info.fallbackQuality !== null) {
      extras.push(
        t('priceSourceQualityFallback', {
          quality: info.fallbackQuality,
          label: tShop(`quality.${qualityKey(info.fallbackQuality)}`),
        }),
      )
    }
    const base = info.isSpot
      ? t('priceSourceCitySpot', { city: info.city })
      : t('priceSourceCityAvg', { city: info.city })
    return extras.length > 0 ? `${base} · ${extras.join(' · ')}` : base
  }
  return source
}

export default function ShopInventoryEditor({ rows, discountRate }: Props) {
  const router = useRouter()
  const t = useTranslations('adminShopInventory')
  const locale = useLocale() as Locale
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [syncSummary, setSyncSummary] = useState<PriceSyncSummary | null>(null)
  const [resetSummary, setResetSummary] = useState<{
    stockRowsZeroed: number
    logsDeleted: number
  } | null>(null)
  const [query, setQuery] = useState('')
  const [filterTier, setFilterTier] = useState<number | 'all'>('all')

  const localizedRows = useMemo<InventoryRow[]>(() => {
    return rows.map((r) => ({
      ...r,
      nameKo: getLocalizedItemName(r.uniqueName, locale, r.nameKo) ?? r.nameKo,
    }))
  }, [rows, locale])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return localizedRows.filter((r) => {
      if (filterTier !== 'all' && r.tier !== filterTier) return false
      if (!q) return true
      return (
        r.nameKo.toLowerCase().includes(q) ||
        r.uniqueName.toLowerCase().includes(q)
      )
    })
  }, [localizedRows, query, filterTier])

  const totalStock = useMemo(
    () => rows.reduce((sum, r) => sum + (r.stock > 0 ? r.stock : 0), 0),
    [rows],
  )

  const handleSync = () => {
    setError('')
    setSyncSummary(null)
    setResetSummary(null)
    startTransition(async () => {
      const result = await syncShopPrices()
      setSyncSummary(result)
      if (result.error) setError(result.error)
      router.refresh()
    })
  }

  const handleReset = () => {
    if (!confirm(t('resetConfirm'))) {
      return
    }
    setError('')
    setSyncSummary(null)
    setResetSummary(null)
    startTransition(async () => {
      const result = await resetShopInventory()
      if (result.error) {
        setError(result.error)
        return
      }
      setResetSummary({
        stockRowsZeroed: result.stockRowsZeroed,
        logsDeleted: result.logsDeleted,
      })
      router.refresh()
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Package size={16} className="text-amber-400" />
        <h2 className="font-bold text-white">{t('title')}</h2>
        <span className="text-xs text-gray-500">
          {t('rowsAndStock', {
            rows: rows.length.toLocaleString(),
            stock: totalStock.toLocaleString(),
          })}
        </span>
        <button
          type="button"
          onClick={handleSync}
          disabled={pending || rows.length === 0}
          className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-3 py-1.5 rounded-lg transition-colors text-xs"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {t('syncButton')}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={pending}
          className="flex items-center gap-1.5 bg-gray-800 hover:bg-red-900/40 hover:border-red-700 border border-gray-700 disabled:bg-gray-900 disabled:text-gray-600 disabled:border-gray-800 text-red-300 px-3 py-1.5 rounded-lg transition-colors text-xs"
          title={t('resetTitle')}
        >
          <RotateCcw size={12} />
          {t('resetButton')}
        </button>
      </div>

      <p className="text-gray-500 text-xs">
        {t('descriptionPrefix')}{' '}
        <code className="text-gray-400">×{discountRate}</code> {t('descriptionSuffix')}
      </p>

      {syncSummary && !syncSummary.error && (
        <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
          {t('syncSummary', {
            requested: syncSummary.requested,
            updated: syncSummary.updated,
            missing: syncSummary.missing,
          })}
        </div>
      )}
      {resetSummary !== null && (
        <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
          {t('resetSummary', {
            rows: resetSummary.stockRowsZeroed.toLocaleString(),
            logs: resetSummary.logsDeleted.toLocaleString(),
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
        </div>
        <select
          value={filterTier}
          onChange={(e) =>
            setFilterTier(e.target.value === 'all' ? 'all' : Number(e.target.value))
          }
          className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
        >
          <option value="all">{t('filterAllTiers')}</option>
          {[3, 4, 5, 6, 7, 8].map((ti) => (
            <option key={ti} value={ti}>
              T{ti}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">
          {rows.length === 0 ? t('emptyNoInventory') : t('emptyNoResults')}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((row) => (
            <InventoryListItem
              key={row.id}
              row={row}
              discountRate={discountRate}
              pending={pending}
              onStart={startTransition}
              onError={setError}
              onDone={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InventoryListItem({
  row,
  discountRate,
  pending,
  onStart,
  onError,
  onDone,
}: {
  row: InventoryRow
  discountRate: number
  pending: boolean
  onStart: (cb: () => void) => void
  onError: (msg: string) => void
  onDone: () => void
}) {
  const t = useTranslations('adminShopInventory')
  const tShop = useTranslations('shop')
  const tTime = useTranslations('time')
  const [editingStock, setEditingStock] = useState(false)
  const [editingPrice, setEditingPrice] = useState(false)
  const [stockInput, setStockInput] = useState(String(row.stock))
  const [priceInput, setPriceInput] = useState(
    row.manualPrice !== null ? String(row.manualPrice) : '',
  )

  const pointPrice = computePointPrice({
    manualPrice: row.manualPrice,
    autoPriceSilver: row.autoPriceSilver,
    discountRate,
  })

  const commitStock = () => {
    const n = Number(stockInput)
    if (!Number.isInteger(n) || n < 0) {
      onError(t('stockMustBeNonNegInt'))
      return
    }
    onError('')
    onStart(async () => {
      const result = await updateInventoryStock(row.id, n)
      if (result.error) {
        onError(result.error)
        return
      }
      setEditingStock(false)
      onDone()
    })
  }

  const commitPrice = () => {
    const raw = priceInput.trim()
    if (!raw) {
      // 빈 값 = 수동 가격 해제
      onError('')
      onStart(async () => {
        const result = await clearManualPrice(row.id)
        if (result.error) {
          onError(result.error)
          return
        }
        setEditingPrice(false)
        onDone()
      })
      return
    }
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0) {
      onError(t('priceMustBeNonNegInt'))
      return
    }
    onError('')
    onStart(async () => {
      const result = await setManualPrice(row.id, n)
      if (result.error) {
        onError(result.error)
        return
      }
      setEditingPrice(false)
      onDone()
    })
  }

  const handleDelete = () => {
    if (!confirm(t('deleteConfirm', { name: row.nameKo }))) return
    onStart(async () => {
      const result = await deleteInventoryRow(row.id)
      if (result.error) {
        onError(result.error)
        return
      }
      onDone()
    })
  }

  return (
    <div className="flex items-center gap-2 bg-gray-800/40 border border-gray-800 rounded-lg px-2 py-1.5">
      <div className="relative w-10 h-10 rounded overflow-hidden bg-gray-900 border border-gray-700 flex-shrink-0">
        <Image
          src={imageUrl(row.uniqueName, row.enchant, row.quality, 48)}
          alt={row.nameKo}
          fill
          className="object-contain pixel-img"
          unoptimized
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-white font-medium truncate">{row.nameKo}</span>
          {row.enchant > 0 && (
            <span className="text-[10px] text-amber-300 font-mono flex-shrink-0">
              .{row.enchant}
            </span>
          )}
          {row.quality > 1 && (
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              {tShop(`quality.${qualityKey(row.quality)}`)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          {row.tier && <span>T{row.tier}</span>}
          <span className="font-mono truncate">{row.uniqueName}</span>
        </div>
      </div>

      {/* 재고 */}
      <div className="flex items-center gap-1 w-20 justify-end">
        {editingStock ? (
          <>
            <input
              type="text"
              inputMode="numeric"
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitStock()
                if (e.key === 'Escape') setEditingStock(false)
              }}
              className="w-14 bg-gray-900 border border-amber-500 rounded px-1.5 py-0.5 text-xs text-white text-right font-mono focus:outline-none"
              autoFocus
              disabled={pending}
            />
            <button
              type="button"
              onClick={commitStock}
              disabled={pending}
              className="text-emerald-400 hover:text-emerald-300"
              title={t('saveTitle')}
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                setStockInput(String(row.stock))
                setEditingStock(false)
              }}
              disabled={pending}
              className="text-gray-500 hover:text-gray-300"
              title={t('cancelTitle')}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditingStock(true)}
            disabled={pending}
            className="flex items-center gap-1 text-xs font-mono text-white hover:text-amber-300"
            title={t('stockEditTitle')}
          >
            {row.stock.toLocaleString()}
            <Pencil size={10} className="text-gray-500" />
          </button>
        )}
      </div>

      {/* 가격 */}
      <div className="flex items-center gap-1 w-28 justify-end">
        {editingPrice ? (
          <>
            <input
              type="text"
              inputMode="numeric"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitPrice()
                if (e.key === 'Escape') setEditingPrice(false)
              }}
              placeholder="auto"
              className="w-20 bg-gray-900 border border-amber-500 rounded px-1.5 py-0.5 text-xs text-white text-right font-mono focus:outline-none"
              autoFocus
              disabled={pending}
            />
            <button
              type="button"
              onClick={commitPrice}
              disabled={pending}
              className="text-emerald-400 hover:text-emerald-300"
              title={t('saveAutoTitle')}
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                setPriceInput(row.manualPrice !== null ? String(row.manualPrice) : '')
                setEditingPrice(false)
              }}
              disabled={pending}
              className="text-gray-500 hover:text-gray-300"
              title={t('cancelTitle')}
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditingPrice(true)}
            disabled={pending}
            className="flex flex-col items-end hover:text-amber-300 group"
            title={priceSourceTooltip(row.priceSource, t, tShop)}
          >
            <span className="flex items-center gap-1 text-xs font-mono text-white">
              {pointPrice !== null ? `${pointPrice.toLocaleString()}p` : '—'}
              {row.manualPrice === null && row.priceWarningLevel && (
                <span
                  className={`text-[9px] font-bold rounded px-1 leading-tight ${
                    WARNING_COLOR[row.priceWarningLevel]
                  }`}
                  title={tShop(`priceWarningAdmin.${row.priceWarningLevel}`)}
                >
                  {tShop('priceWarning')}
                </span>
              )}
              <Pencil size={10} className="text-gray-500 group-hover:text-amber-300" />
            </span>
            <span className="text-[9px] text-gray-500 font-mono">
              {row.manualPrice !== null
                ? t('sourceLabelManual')
                : row.autoPriceSilver
                ? (() => {
                    const fq = fallbackQuality(row.priceSource)
                    const spotTag = isSpotFallback(row.priceSource) ? ' · spot' : ''
                    const qTag = fq !== null ? ` · q${fq}` : ''
                    return t('sourceAutoWithTime', {
                      time: formatRelativeFine(row.priceUpdatedAt, tTime),
                      suffix: `${spotTag}${qTag}`,
                    })
                  })()
                : t('sourceLabelNone')}
            </span>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleDelete}
        disabled={pending || row.stock > 0}
        className="text-gray-600 hover:text-red-400 disabled:text-gray-800 transition-colors flex-shrink-0"
        title={row.stock > 0 ? t('deleteBlockedTitle') : t('deleteRowTitle')}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}
