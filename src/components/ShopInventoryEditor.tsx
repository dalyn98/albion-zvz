'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
  priceUpdatedAt: string | null
  updatedAt: string
}

interface Props {
  rows: InventoryRow[]
  silverToPointRate: number
}

const QUALITY_LABELS = ['?', '일반', '좋음', '뛰어남', '우수', '걸작']

function imageUrl(uniqueName: string, enchant: number, quality: number, size = 60): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: String(size) })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

function formatAgo(iso: string | null): string {
  if (!iso) return '—'
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return '—'
  const diffMin = Math.round((Date.now() - ts) / 60000)
  if (diffMin < 1) return '방금'
  if (diffMin < 60) return `${diffMin}분 전`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}시간 전`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}일 전`
}

// price_source 는 `aodp:{city}` 또는 `aodp:{city}:spot` 또는 `manual`.
// `:spot` 접미사는 avg_Nd 모드에서 history 데이터가 없어 현재가로 폴백했음을 의미.
function isSpotFallback(source: string | null): boolean {
  return source !== null && source.endsWith(':spot')
}

function priceSourceTooltip(source: string | null): string {
  if (!source) return '포인트 가격 수정 (빈 값 = 자동)'
  if (source === 'manual') return '수동 고정가 (빈 값으로 저장하면 자동으로 복귀)'
  if (source.startsWith('aodp:')) {
    const parts = source.split(':')
    const city = parts[1] ?? ''
    const isSpot = parts[2] === 'spot'
    if (isSpot) {
      return `${city} 현재가 (설정된 평균 기간 내 history 데이터가 없어 spot 호가로 폴백)`
    }
    return `${city} AODP 평균가`
  }
  return source
}

export default function ShopInventoryEditor({ rows, silverToPointRate }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [syncSummary, setSyncSummary] = useState<PriceSyncSummary | null>(null)
  const [resetSummary, setResetSummary] = useState<{
    stockRowsZeroed: number
    logsDeleted: number
  } | null>(null)
  const [query, setQuery] = useState('')
  const [filterTier, setFilterTier] = useState<number | 'all'>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (filterTier !== 'all' && r.tier !== filterTier) return false
      if (!q) return true
      return (
        r.nameKo.toLowerCase().includes(q) ||
        r.uniqueName.toLowerCase().includes(q)
      )
    })
  }, [rows, query, filterTier])

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
    if (
      !confirm(
        '전 재고를 0 으로 초기화하고 원본 상자 로그도 삭제합니다. 수동 가격 / 카테고리 / 주문 내역 / 블랙리스트 / 오버라이드는 유지됩니다. 계속?',
      )
    ) {
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
        <h2 className="font-bold text-white">재고 / 가격</h2>
        <span className="text-xs text-gray-500">
          {rows.length.toLocaleString()}종 · 총 {totalStock.toLocaleString()}개
        </span>
        <button
          type="button"
          onClick={handleSync}
          disabled={pending || rows.length === 0}
          className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-3 py-1.5 rounded-lg transition-colors text-xs"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          AODP 시세 갱신
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={pending}
          className="flex items-center gap-1.5 bg-gray-800 hover:bg-red-900/40 hover:border-red-700 border border-gray-700 disabled:bg-gray-900 disabled:text-gray-600 disabled:border-gray-800 text-red-300 px-3 py-1.5 rounded-lg transition-colors text-xs"
          title="전 재고를 0 으로 초기화 + 원본 로그 삭제 (가격/카테고리/주문은 보존)"
        >
          <RotateCcw size={12} />
          재고 초기화
        </button>
      </div>

      <p className="text-gray-500 text-xs">
        AODP 시세(관리자 설정의 서버/도시/모드 적용)를 전 재고에 대해 한 번에 조회합니다. manual_price 가 있으면 그 값을 우선. 환율{' '}
        <code className="text-gray-400">1p = {silverToPointRate.toLocaleString()}s</code>.
      </p>

      {syncSummary && !syncSummary.error && (
        <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
          {syncSummary.requested}건 중 {syncSummary.updated}건 갱신 · {syncSummary.missing}건 시세 없음
        </div>
      )}
      {resetSummary !== null && (
        <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
          {resetSummary.stockRowsZeroed.toLocaleString()}개 행의 재고를 0 으로 초기화했습니다. 원본 로그{' '}
          {resetSummary.logsDeleted.toLocaleString()}행 삭제.
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
            placeholder="이름/UniqueName 검색"
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
          <option value="all">전체 Tier</option>
          {[3, 4, 5, 6, 7, 8].map((t) => (
            <option key={t} value={t}>
              T{t}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">
          {rows.length === 0
            ? '재고 없음. 로그 임포트로 시작하세요.'
            : '검색 결과 없음.'}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((row) => (
            <InventoryListItem
              key={row.id}
              row={row}
              silverToPointRate={silverToPointRate}
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
  silverToPointRate,
  pending,
  onStart,
  onError,
  onDone,
}: {
  row: InventoryRow
  silverToPointRate: number
  pending: boolean
  onStart: (cb: () => void) => void
  onError: (msg: string) => void
  onDone: () => void
}) {
  const [editingStock, setEditingStock] = useState(false)
  const [editingPrice, setEditingPrice] = useState(false)
  const [stockInput, setStockInput] = useState(String(row.stock))
  const [priceInput, setPriceInput] = useState(
    row.manualPrice !== null ? String(row.manualPrice) : '',
  )

  const pointPrice = computePointPrice({
    manualPrice: row.manualPrice,
    autoPriceSilver: row.autoPriceSilver,
    silverToPointRate,
  })

  const commitStock = () => {
    const n = Number(stockInput)
    if (!Number.isInteger(n) || n < 0) {
      onError('재고는 0 이상 정수.')
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
      onError('가격은 0 이상 정수.')
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
    if (!confirm(`"${row.nameKo}" 재고 행을 삭제합니다. 계속?`)) return
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
              {QUALITY_LABELS[row.quality]}
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
              title="저장"
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
              title="취소"
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
            title="재고 수정"
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
              title="저장 (빈 값 = 자동)"
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
              title="취소"
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
            title={priceSourceTooltip(row.priceSource)}
          >
            <span className="flex items-center gap-1 text-xs font-mono text-white">
              {pointPrice !== null ? `${pointPrice.toLocaleString()}p` : '—'}
              <Pencil size={10} className="text-gray-500 group-hover:text-amber-300" />
            </span>
            <span className="text-[9px] text-gray-500 font-mono">
              {row.manualPrice !== null
                ? 'manual'
                : row.autoPriceSilver
                ? `auto · ${formatAgo(row.priceUpdatedAt)}${isSpotFallback(row.priceSource) ? ' · spot' : ''}`
                : 'no price'}
            </span>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleDelete}
        disabled={pending || row.stock > 0}
        className="text-gray-600 hover:text-red-400 disabled:text-gray-800 transition-colors flex-shrink-0"
        title={row.stock > 0 ? '재고가 있는 행은 삭제 불가' : '삭제'}
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}
