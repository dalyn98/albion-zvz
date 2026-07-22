'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  ShoppingCart,
  X,
  Plus,
  Minus,
  Search,
  Send,
  Loader2,
  Trash2,
  Info,
  Pencil,
  AlertTriangle,
} from 'lucide-react'
import {
  reviewShopOrder,
  submitShopOrder,
  type OrderLineInput,
} from '@/app/actions/shop-member'
import { categorizeGearItem, type GearSlot } from '@/lib/inventory-types'
import { buildAlbionItemImageUrlCandidates } from '@/lib/albion-render'
import { SHOP_CANONICAL_QUALITY } from '@/lib/shop/quality'
import {
  compareShopCatalogOrder,
  DEFAULT_SHOP_CATALOG_SORT_MODE,
  normalizeShopCatalogSortMode,
  SHOP_CATALOG_SORT_MODES,
  type ShopCatalogSortMode,
} from '@/lib/shop/category-order'
import { formatShopTierEnchantLabel } from '@/lib/shop/catalog-display'
import {
  applyShopCartQuantityDelta,
  normalizeShopCartQuantityInput,
} from '@/lib/shop/cart-quantity'
import AlbionItemImage from './AlbionItemImage'
import HoverTip from './HoverTip'
import {
  parseShopCartDraft,
  restoreShopCartDraft,
  type ShopCartDraft,
} from '@/lib/shop-cart-draft'
import { emitUxWorkflowEvent } from '@/lib/ux-telemetry'

export type ShopPriceWarning = 'quality' | 'window' | 'bluezone' | 'redzone' | null

// 서버측 shop-member.ts 의 MEMO_MAX 와 동기. 사용자가 입력 한도를 미리 보고
// 잘못 잘려나가는 일을 막기 위해 카운터로 노출.
const SHOP_NOTE_MAX = 500
const CATALOG_PAGE_SIZE = 80
const SHOP_CART_SESSION_KEY = 'albion-guild-manager:shop-cart:v1'
const INTEGER_FORMATTER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function formatInteger(value: number): string {
  return INTEGER_FORMATTER.format(value)
}

export interface CatalogItem {
  id: string
  uniqueName: string
  enchant: number
  quality: number
  stock: number
  nameKo: string
  category: string | null
  tier: number | null
  pointPrice: number | null
  priceWarning: ShopPriceWarning
  displayName: string
  localizedName: string
  originalName: string
}

// AODP 폴백 단계별 경고 색상. 라벨과 툴팁 문구는 i18n (shop.priceWarning* 키).
// 색상으로 심각도만 차등 (노랑=경미, 주황=주의, 빨강=심각).
const PRICE_WARNING_COLOR: Record<NonNullable<ShopPriceWarning>, string> = {
  quality: 'bg-yellow-400 text-black',
  window: 'bg-yellow-400 text-black',
  bluezone: 'bg-orange-500 text-black',
  redzone: 'bg-red-600 text-white',
}

interface Props {
  items: CatalogItem[]
  balance: number
  isMember: boolean
  // AODP 기준 도시 한글 라벨 — /shop 상단에 "시세 기준: ○○" 로 노출한다.
  baseCityLabel: string
  discountRate: number
  interactionMode?: 'live' | 'demo'
  initialQuery?: string
  initialTier?: number | 'all'
  initialSort?: ShopCatalogSortMode
  serverPage?: {
    page: number
    pageSize: number
    total: number
    isTotalApproximate: boolean
    hasMore: boolean
  }
  visualRefreshEnabled?: boolean
}

interface CartLine {
  item: CatalogDisplayItem
  qty: number
  quoteUnitSilver: string
  quoteCity: string
  quoteNote: string
  quoteOpen: boolean
}

interface ReviewedOrderLine {
  input: OrderLineInput
  displayName: string
  quantity: number
  unitPoints: number
  subtotalPoints: number
  pricingSource: 'catalog' | 'member_quote'
}

type QuotePatch = Partial<
  Pick<
    CartLine,
    | 'quoteUnitSilver'
    | 'quoteCity'
    | 'quoteNote'
    | 'quoteOpen'
  >
>

type CatalogDisplayItem = CatalogItem

type ShopItemTypeKey =
  | GearSlot
  | 'mount'
  | 'potion'
  | 'food'

const SHOP_ITEM_TYPE_KEYS = new Set<string>([
  'weapon',
  'head',
  'armor',
  'shoes',
  'offhand',
  'cape',
  'bag',
  'mount',
  'potion',
  'food',
  'other',
])

function imageSrcs(uniqueName: string, enchant: number, size = 96): string[] {
  return buildAlbionItemImageUrlCandidates({
    uniqueName,
    enchant,
    quality: SHOP_CANONICAL_QUALITY,
    size,
  })
}

function shopItemTypeKey(item: CatalogItem): ShopItemTypeKey {
  const slot = categorizeGearItem(item.uniqueName).slot
  if (slot !== 'other') return slot
  const category = item.category?.toLowerCase()
  if (category && SHOP_ITEM_TYPE_KEYS.has(category)) {
    return category as ShopItemTypeKey
  }
  return 'other'
}

function parsePositiveIntegerInput(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

function normalizeCatalogFilterQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function quoteUnitPoints(line: CartLine, discountRate: number): number | null {
  const unitSilver = parsePositiveIntegerInput(line.quoteUnitSilver)
  if (unitSilver === null) return null
  return Math.max(1, Math.ceil(unitSilver * discountRate))
}

function lineOrderPoints(line: CartLine, discountRate: number): number | null {
  const quotePoints = quoteUnitPoints(line, discountRate)
  if (quotePoints !== null) return quotePoints * line.qty
  if (line.item.pointPrice !== null) return line.item.pointPrice * line.qty
  return null
}

export default function ShopCatalog({
  items,
  balance,
  isMember,
  baseCityLabel,
  discountRate,
  interactionMode = 'live',
  initialQuery = '',
  initialTier = 'all',
  initialSort = DEFAULT_SHOP_CATALOG_SORT_MODE,
  serverPage,
  visualRefreshEnabled = false,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations('shopCatalog')
  const tShop = useTranslations('shop')
  const [query, setQuery] = useState(initialQuery)
  const [tier, setTier] = useState<number | 'all'>(initialTier)
  const [sort, setSort] = useState<ShopCatalogSortMode>(initialSort)
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [note, setNote] = useState('')
  const [catalogPending, startCatalogTransition] = useTransition()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string; refreshed?: boolean } | null>(null)
  const [cartRestored, setCartRestored] = useState(false)
  const [restoreNotice, setRestoreNotice] = useState<{ removed: number; clamped: number; repriced: number } | null>(null)
  const [orderReviewOpen, setOrderReviewOpen] = useState(false)
  const [reviewedOrderLines, setReviewedOrderLines] = useState<ReviewedOrderLine[]>([])
  const [reviewedNote, setReviewedNote] = useState('')
  const [reviewedBalance, setReviewedBalance] = useState(balance)
  const filterKey = `${query}\u0000${tier}\u0000${sort}`
  const [visibleWindow, setVisibleWindow] = useState<{ filterKey: string; limit: number }>({
    filterKey: '',
    limit: CATALOG_PAGE_SIZE,
  })
  const isServerDriven = serverPage !== undefined
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  useEffect(() => {
    const draft = parseShopCartDraft(sessionStorage.getItem(SHOP_CART_SESSION_KEY))
    if (draft) {
      const restored = restoreShopCartDraft(draft, items, {
        // 서버 페이지네이션에서는 현재 페이지에 없는 상품도 정상 상품일 수 있다.
        // 저장된 표시 스냅샷으로 라인을 유지하고 주문 제출 시 서버가 최종 검증한다.
        preserveMissingWithSnapshot: isServerDriven,
      })
      const restoredLines = restored.lines.flatMap((line) => {
        const item = itemById.get(line.inventoryId) ?? line.itemSnapshot
        if (!item) return []
        return [{
          item,
          qty: line.quantity,
          quoteUnitSilver: line.quoteUnitSilver ?? '',
          quoteCity: line.quoteCity ?? '',
          quoteNote: line.quoteNote ?? '',
          quoteOpen: line.quoteOpen ?? item.pointPrice === null,
        }]
      })
      // 서버에서 새로 받은 재고·가격으로 세션 장바구니를 한 번 재구성한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCart(restoredLines)
      const { removedIds, clampedIds, repricedIds } = restored.changes
      if (removedIds.length + clampedIds.length + repricedIds.length > 0) {
        setRestoreNotice({
          removed: removedIds.length,
          clamped: clampedIds.length,
          repriced: repricedIds.length,
        })
      }
    }
    setCartRestored(true)
  }, [isServerDriven, itemById, items])

  useEffect(() => {
    if (!cartRestored) return
    if (cart.length === 0) {
      sessionStorage.removeItem(SHOP_CART_SESSION_KEY)
      return
    }
    const draft: ShopCartDraft = {
      version: 1,
      lines: cart.map((line) => ({
        inventoryId: line.item.id,
        quantity: line.qty,
        quotedUnitPoints: line.item.pointPrice,
        itemSnapshot: line.item,
        quoteUnitSilver: line.quoteUnitSilver,
        quoteCity: line.quoteCity,
        quoteNote: line.quoteNote,
        quoteOpen: line.quoteOpen,
      })),
    }
    sessionStorage.setItem(SHOP_CART_SESSION_KEY, JSON.stringify(draft))
  }, [cart, cartRestored])

  const replaceCatalogUrl = useCallback((input: {
    query?: string
    tier?: number | 'all'
    sort?: ShopCatalogSortMode
    page?: number
  }) => {
    if (!isServerDriven) return
    const params = new URLSearchParams(searchParams.toString())
    const nextQuery = normalizeCatalogFilterQuery(input.query ?? query)
    if (nextQuery) {
      params.set('q', nextQuery)
    } else {
      params.delete('q')
    }

    const nextTier = input.tier ?? tier
    if (nextTier === 'all') {
      params.delete('tier')
    } else {
      params.set('tier', String(nextTier))
    }

    const nextSort = input.sort ?? sort
    if (nextSort === DEFAULT_SHOP_CATALOG_SORT_MODE) {
      params.delete('sort')
    } else {
      params.set('sort', nextSort)
    }

    const nextPage = input.page ?? 1
    if (nextPage > 1) {
      params.set('page', String(nextPage))
    } else {
      params.delete('page')
    }

    const queryString = params.toString()
    const nextHref = queryString ? `${pathname}?${queryString}` : pathname
    const currentQueryString = searchParams.toString()
    const currentHref = currentQueryString ? `${pathname}?${currentQueryString}` : pathname
    if (nextHref === currentHref) return
    startCatalogTransition(() => {
      router.replace(nextHref, { scroll: false })
    })
  }, [isServerDriven, pathname, query, router, searchParams, sort, tier])

  useEffect(() => {
    if (!isServerDriven) return
    const normalizedQuery = normalizeCatalogFilterQuery(query)
    if (normalizedQuery === initialQuery && tier === initialTier && sort === initialSort) return
    const handle = window.setTimeout(() => {
      replaceCatalogUrl({ query: normalizedQuery, tier, sort, page: 1 })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [initialQuery, initialSort, initialTier, isServerDriven, query, replaceCatalogUrl, sort, tier])

  const filtered = useMemo(() => {
    if (isServerDriven) return items
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (tier !== 'all' && it.tier !== tier) return false
      if (!q) return true
      return (
        it.displayName.toLowerCase().includes(q) ||
        it.localizedName.toLowerCase().includes(q) ||
        it.originalName.toLowerCase().includes(q) ||
        it.uniqueName.toLowerCase().includes(q) ||
        formatShopTierEnchantLabel(it).includes(q) ||
        shopItemTypeKey(it).toLowerCase().includes(q)
      )
    }).sort((a, b) => compareShopCatalogOrder(a, b, sort))
  }, [isServerDriven, items, query, sort, tier])
  const visibleLimit =
    visibleWindow.filterKey === filterKey ? visibleWindow.limit : CATALOG_PAGE_SIZE
  const visibleItems = isServerDriven ? filtered : filtered.slice(0, visibleLimit)
  const hasMoreItems = serverPage?.hasMore ?? visibleLimit < filtered.length
  const totalItemCount = serverPage?.total ?? filtered.length
  const totalItemCountLabel =
    serverPage?.isTotalApproximate && hasMoreItems
      ? `${formatInteger(totalItemCount)}+`
      : formatInteger(totalItemCount)

  const totalQty = cart.reduce((s, l) => s + l.qty, 0)
  const totalPoints = cart.reduce((sum, line) => {
    const linePoints = lineOrderPoints(line, discountRate)
    return sum + (linePoints ?? 0)
  }, 0)
  const hasRequiredQuoteMissing = cart.some(
    (line) => line.item.pointPrice === null && quoteUnitPoints(line, discountRate) === null,
  )
  const hasInvalidOptionalQuote = cart.some(
    (line) => {
      const hasPriceInput = line.quoteUnitSilver.trim() !== ''
      const hasQuoteMeta =
        line.quoteCity.trim() !== '' ||
        line.quoteNote.trim() !== ''
      return (
        (hasPriceInput && quoteUnitPoints(line, discountRate) === null) ||
        (!hasPriceInput && hasQuoteMeta)
      )
    },
  )
  const totalKnown = !hasRequiredQuoteMissing
  const insufficient = totalKnown && totalPoints > balance
  const hasServerUnverifiedLine =
    isServerDriven && cart.some((line) => !itemById.has(line.item.id))
  const reviewInsufficient = insufficient && !hasServerUnverifiedLine

  const addToCart = (item: CatalogDisplayItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.item.id === item.id)
      if (!existing) {
        return [
          ...prev,
          {
            item,
            qty: 1,
            quoteUnitSilver: '',
            quoteCity: '',
            quoteNote: '',
            quoteOpen: item.pointPrice === null,
          },
        ]
      }
      if (existing.qty >= item.stock) {
        return prev
      }
      return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l))
    })
    setResult(null)
  }

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => {
      const line = prev.find((l) => l.item.id === id)
      if (!line) return prev
      const next = applyShopCartQuantityDelta(line.qty, delta, line.item.stock)
      if (next === 0) return prev.filter((l) => l.item.id !== id)
      return prev.map((l) => (l.item.id === id ? { ...l, qty: next } : l))
    })
    setResult(null)
  }

  const updateQtyInput = (id: string, value: string) => {
    setCart((prev) => {
      const line = prev.find((l) => l.item.id === id)
      if (!line) return prev
      const next = normalizeShopCartQuantityInput(value, line.item.stock)
      if (next === null || next === line.qty) return prev
      return prev.map((l) => (l.item.id === id ? { ...l, qty: next } : l))
    })
    setResult(null)
  }

  const setQtyToStock = (id: string) => {
    setCart((prev) => {
      const line = prev.find((l) => l.item.id === id)
      if (!line) return prev
      const next = normalizeShopCartQuantityInput(String(line.item.stock), line.item.stock)
      if (next === null || next === line.qty) return prev
      return prev.map((l) => (l.item.id === id ? { ...l, qty: next } : l))
    })
    setResult(null)
  }

  const removeLine = (id: string) => {
    setCart((prev) => prev.filter((l) => l.item.id !== id))
  }

  const updateQuote = (
    id: string,
    patch: QuotePatch,
  ) => {
    setCart((prev) => prev.map((line) => (line.item.id === id ? { ...line, ...patch } : line)))
    setResult(null)
  }

  const clearCart = () => {
    setCart([])
    setNote('')
    setResult(null)
  }

  const handleSubmit = () => {
    if (cart.length === 0) return
    setResult(null)
    const inputs = cart.flatMap((line): OrderLineInput[] => {
      const unitPoints = quoteUnitPoints(line, discountRate) ?? line.item.pointPrice
      if (unitPoints === null) return []
      const quoteSilver = parsePositiveIntegerInput(line.quoteUnitSilver)
      return [{
        inventoryId: line.item.id,
        quantity: line.qty,
        memberQuoteUnitSilver: quoteSilver,
        memberQuoteCity: line.quoteCity.trim() || null,
        memberQuoteNote: line.quoteNote.trim() || null,
      }]
    })
    if (inputs.length !== cart.length) return
    const noteSnapshot = note
    if (interactionMode === 'demo') {
      const reviewed = cart.map((line): ReviewedOrderLine => {
        const unitPoints = quoteUnitPoints(line, discountRate) ?? line.item.pointPrice ?? 0
        const input = inputs.find((candidate) => candidate.inventoryId === line.item.id)!
        return {
          input: { ...input, expectedUnitPoints: unitPoints },
          displayName: line.item.displayName,
          quantity: line.qty,
          unitPoints,
          subtotalPoints: unitPoints * line.qty,
          pricingSource: input.memberQuoteUnitSilver === null ? 'catalog' : 'member_quote',
        }
      })
      setReviewedOrderLines(reviewed)
      setReviewedNote(noteSnapshot)
      setReviewedBalance(balance)
      setOrderReviewOpen(true)
      emitUxWorkflowEvent({
        eventType: 'previewed',
        metadata: { workflow: 'shop_order', stage: 'review' },
      })
      return
    }
    startTransition(async () => {
      const result = await reviewShopOrder(inputs)
      if (!result.ok) {
        setResult({ ok: false, message: result.error, refreshed: true })
        emitUxWorkflowEvent({
          eventType: 'validation_failed',
          metadata: { workflow: 'shop_order', stage: 'review' },
        })
        router.refresh()
        return
      }
      const reviewed = result.lines.flatMap((serverLine): ReviewedOrderLine[] => {
        const cartLine = cart.find((line) => line.item.id === serverLine.inventoryId)
        const input = inputs.find((candidate) => candidate.inventoryId === serverLine.inventoryId)
        if (!cartLine || !input) return []
        return [{
          input: { ...input, expectedUnitPoints: serverLine.unitPoints },
          displayName: cartLine.item.displayName,
          quantity: serverLine.quantity,
          unitPoints: serverLine.unitPoints,
          subtotalPoints: serverLine.subtotalPoints,
          pricingSource: serverLine.pricingSource,
        }]
      })
      if (reviewed.length !== cart.length) return
      setReviewedOrderLines(reviewed)
      setReviewedNote(noteSnapshot)
      setReviewedBalance(result.balance)
      setOrderReviewOpen(true)
      emitUxWorkflowEvent({
        eventType: 'previewed',
        metadata: { workflow: 'shop_order', stage: 'review' },
      })
    })
  }

  const commitReviewedOrder = () => {
    if (reviewedOrderLines.length === 0 || pending) return
    const reviewedInputs = reviewedOrderLines.map((line) => line.input)
    if (interactionMode === 'demo') {
      setCart([])
      setNote('')
      setCartOpen(false)
      setOrderReviewOpen(false)
      setResult({ ok: true, message: t('orderSuccess') })
      return
    }
    startTransition(async () => {
      emitUxWorkflowEvent({ eventType: 'submitted', metadata: { workflow: 'shop_order', stage: 'commit' } })
      const res = await submitShopOrder(
        reviewedInputs,
        reviewedNote,
      )
      if (res.ok) {
        sessionStorage.removeItem(SHOP_CART_SESSION_KEY)
        setCart([])
        setNote('')
        setCartOpen(false)
        setOrderReviewOpen(false)
        setResult({ ok: true, message: t('orderSuccess') })
        emitUxWorkflowEvent({ eventType: 'completed', metadata: { workflow: 'shop_order', result: 'success' } })
        router.refresh()
      } else {
        setOrderReviewOpen(false)
        setResult({
          ok: false,
          message: res.error ?? t('orderFailedDefault'),
          refreshed: true,
        })
        emitUxWorkflowEvent({ eventType: 'partial_failed', metadata: { workflow: 'shop_order', result: 'revalidation_failed' } })
        router.refresh()
      }
    })
  }

  // 좌: 카탈로그, 우: 장바구니 (lg+ 상시 표시). 모바일에선 아래 토글 드로어로 전환.
  return (
    <div className={`${visualRefreshEnabled ? 'v3-shop-workspace ' : ''}lg:grid lg:grid-cols-[1fr_20rem] lg:gap-4 lg:items-start`}>
      <div className="space-y-3 min-w-0">
        {/* 시세 기준 도시 안내 — 관리자가 설정한 홈 거래소. Info 아이콘 호버 시
            AODP 폴백/부정확 사유를 설명하는 툴팁이 뜬다. 상점 전역에 적용되는
            힌트라 검색 툴바 위쪽 한 줄에 배치. */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <span>{t('baseCityLabel')}</span>
          <span className="text-amber-300 font-semibold">{baseCityLabel}</span>
          <HoverTip
            label={tShop('aodpTooltip')}
            placement="bottom"
            triggerClassName="inline-flex items-center cursor-help text-gray-500"
          >
            <span aria-label={t('aodpAriaLabel')}>
              <Info size={12} />
            </span>
          </HoverTip>
        </div>
        {/* 상단 도구: 검색 + 티어 필터 + 잔액 + (모바일) 장바구니 버튼 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            {catalogPending ? (
              <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-amber-300" />
            ) : (
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">{t('tierAll')}</option>
            {[3, 4, 5, 6, 7, 8].map((t) => (
              <option key={t} value={t}>
                T{t}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(normalizeShopCatalogSortMode(e.target.value))}
            aria-label={t('sortLabel')}
            className="min-w-[7.5rem] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            {SHOP_CATALOG_SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`sort.${mode}`)}
              </option>
            ))}
          </select>
          <div className="hidden sm:flex items-center gap-1 text-xs text-gray-400 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2">
            <span className="text-gray-500">{t('balanceLabel')}</span>
            <span data-shop-price className="font-mono font-bold text-amber-300 tabular-nums">{formatInteger(balance)}p</span>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            disabled={totalQty === 0}
            className="lg:hidden relative flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <ShoppingCart size={14} />
            {t('cartButton')}
            {totalQty > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                {totalQty}
              </span>
            )}
          </button>
        </div>

        {result && (
          <div
            className={`border rounded-lg px-3 py-2 text-xs ${
              result.ok
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-red-500/10 border-red-500/40 text-red-300'
            }`}
          >
            {result.message}
            {!result.ok && result.refreshed && (
              <p className="mt-1 text-[11px] text-red-200/80">
                {t('orderFailedRefreshHint')}
              </p>
            )}
          </div>
        )}

        {restoreNotice && (
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
            <p>
              {t('cartRestoreChanged', {
                removed: restoreNotice.removed,
                clamped: restoreNotice.clamped,
                repriced: restoreNotice.repriced,
              })}
            </p>
            <button
              type="button"
              onClick={() => setRestoreNotice(null)}
              className="mt-1 min-h-10 font-semibold text-sky-100 underline underline-offset-2"
            >
              {t('cartRestoreDismiss')}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-gray-800 bg-gray-900/40">
          {filtered.length === 0 ? (
            <p className="text-gray-300 text-base text-center py-12 font-medium">
              {items.length === 0 ? t('emptyStock') : t('emptySearch')}
            </p>
          ) : (
            <div className="divide-y divide-gray-800">
              {visibleItems.map((item) => {
                const cartQty = cart.find((l) => l.item.id === item.id)?.qty ?? 0
                return (
                  <ShopItemRow
                    key={item.id}
                    item={item}
                    cartQty={cartQty}
                    onAdd={() => addToCart(item)}
                    disabled={!isMember || cartQty >= item.stock}
                  />
                )
              })}
              {(hasMoreItems || totalItemCount > CATALOG_PAGE_SIZE) && (
                <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-gray-500">
                    {t('showingCount', {
                      visible: formatInteger(visibleItems.length),
                      total: totalItemCountLabel,
                    })}
                  </p>
                  {hasMoreItems && (
                    <button
                      type="button"
                      onClick={() => {
                        if (serverPage) {
                          replaceCatalogUrl({ page: serverPage.page + 1 })
                          return
                        }
                        setVisibleWindow((window) => ({
                          filterKey,
                          limit:
                            (window.filterKey === filterKey
                              ? window.limit
                              : CATALOG_PAGE_SIZE) + CATALOG_PAGE_SIZE,
                        }))
                      }}
                      disabled={catalogPending}
                      className="inline-flex min-w-16 items-center justify-center self-start rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:border-amber-500/60 hover:text-amber-200 disabled:cursor-wait disabled:opacity-70 sm:self-auto"
                    >
                      {catalogPending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        t('showMoreButton')
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 데스크톱 사이드바 — 상시 표시. 긴 카탈로그에도 sticky 로 따라옴. */}
      <aside className="hidden lg:block lg:sticky lg:top-4 lg:self-start">
        <CartPanel
          cart={cart}
          totalPoints={totalPoints}
          totalKnown={totalKnown}
          hasInvalidOptionalQuote={hasInvalidOptionalQuote}
          balance={balance}
          insufficient={reviewInsufficient}
          discountRate={discountRate}
          note={note}
          onNoteChange={setNote}
          onQtyDelta={updateQty}
          onQtyInputChange={updateQtyInput}
          onQtyMax={setQtyToStock}
          onRemove={removeLine}
          onQuoteChange={updateQuote}
          onClear={clearCart}
          onSubmit={handleSubmit}
          pending={pending}
          isMember={isMember}
        />
      </aside>

      {/* 모바일 드로어 */}
      {cartOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/70 z-40 lg:hidden"
            onClick={() => setCartOpen(false)}
          />
          <aside className="lg:hidden fixed top-0 right-0 h-dvh w-full max-w-md bg-gray-950 border-l border-gray-800 z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg flex items-center gap-2">
                <ShoppingCart size={18} className="text-amber-400" />
                {t('cartButton')}
              </h2>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="text-gray-400 hover:text-white p-1.5"
                aria-label={t('closeAriaLabel')}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <CartPanel
                cart={cart}
                totalPoints={totalPoints}
                totalKnown={totalKnown}
                hasInvalidOptionalQuote={hasInvalidOptionalQuote}
                balance={balance}
                insufficient={reviewInsufficient}
                discountRate={discountRate}
                note={note}
                onNoteChange={setNote}
                onQtyDelta={updateQty}
                onQtyInputChange={updateQtyInput}
                onQtyMax={setQtyToStock}
                onRemove={removeLine}
                onQuoteChange={updateQuote}
                onClear={clearCart}
                onSubmit={handleSubmit}
                pending={pending}
                isMember={isMember}
                variant="drawer"
              />
            </div>
          </aside>
        </>
      )}

      {visualRefreshEnabled && totalQty > 0 && !cartOpen && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="v3-mobile-cart-bar fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex min-h-12 items-center gap-3 rounded-xl border border-border px-4 py-2 text-left transition-[background-color,transform] duration-150 active:scale-[0.96] lg:hidden"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
            <ShoppingCart size={15} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-foreground">{t('cartButton')}</span>
            <span className="block text-[11px] text-muted">{totalQty}</span>
          </span>
          <span data-shop-price className="font-mono text-sm font-bold tabular-nums text-amber-300">
            {totalKnown ? `${formatInteger(totalPoints)}p` : t('cart.quotePendingTotal')}
          </span>
        </button>
      )}

      {orderReviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shop-order-review-title"
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-4 sm:items-center"
        >
          <div className="w-full max-w-lg space-y-4 rounded-2xl border border-amber-500/40 bg-gray-950 p-5 shadow-2xl">
            <div>
              <h2 id="shop-order-review-title" className="text-lg font-bold text-white">
                {t('orderReviewTitle')}
              </h2>
              <p className="mt-1 text-sm text-gray-400">{t('orderReviewDescription')}</p>
            </div>
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {reviewedOrderLines.map((line) => (
                <li key={line.input.inventoryId} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold text-gray-100">{line.displayName}</span>
                    <span className="shrink-0 font-mono text-amber-300">
                      {formatInteger(line.subtotalPoints)}p
                    </span>
                  </div>
                  <p className="mt-1 text-gray-500">
                    {t('orderReviewLine', {
                      quantity: line.quantity,
                      unitPoints: formatInteger(line.unitPoints),
                      source: line.pricingSource === 'member_quote'
                        ? t('orderReviewQuoteSource')
                        : t('orderReviewCatalogSource'),
                    })}
                  </p>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{t('cart.totalLabel')}</dt>
                <dd className="font-mono font-bold text-amber-300">
                  {formatInteger(reviewedOrderLines.reduce((sum, line) => sum + line.subtotalPoints, 0))}p
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">{t('orderReviewBalanceAfter')}</dt>
                <dd className="font-mono text-gray-200">
                  {formatInteger(reviewedBalance - reviewedOrderLines.reduce((sum, line) => sum + line.subtotalPoints, 0))}p
                </dd>
              </div>
            </dl>
            <p className="text-xs text-amber-200">{t('orderReviewWarning')}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOrderReviewOpen(false)}
                disabled={pending}
                className="min-h-11 rounded-lg border border-gray-700 px-4 text-sm font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              >
                {t('orderReviewBack')}
              </button>
              <button
                type="button"
                onClick={commitReviewedOrder}
                disabled={pending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50"
              >
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {pending ? t('orderReviewSubmitting') : t('orderReviewConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ShopItemRow({
  item,
  cartQty,
  onAdd,
  disabled,
}: {
  item: CatalogDisplayItem
  cartQty: number
  onAdd: () => void
  disabled: boolean
}) {
  const t = useTranslations('shop')
  const tc = useTranslations('shopCatalog')
  const typeLabel = tc(`itemType.${shopItemTypeKey(item)}`)
  const tierEnchant = formatShopTierEnchantLabel(item)
  const inCart = cartQty > 0
  const atMax = cartQty >= item.stock

  const stockLabel = tc('tile.stockPrefix', { stock: formatInteger(item.stock) })
  const cartLabel = inCart ? ` / ${tc('tile.cartPrefix', { qty: cartQty })}` : ''
  const maxLabel = atMax ? ` / ${tc('tile.maxHint')}` : ''
  const priceLabel =
    item.pointPrice === null
      ? tc('quoteRequired')
      : `${formatInteger(item.pointPrice)}p`
  const ariaLabel = `${tierEnchant} ${item.displayName} / ${typeLabel} / ${priceLabel} / ${stockLabel}${cartLabel}${maxLabel}`
  const itemImageSrcs = imageSrcs(item.uniqueName, item.enchant, 64)

  return (
    <div
      className={`grid grid-cols-[2.75rem_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5 sm:grid-cols-[3rem_minmax(0,1fr)_5.5rem_4.75rem_auto] sm:px-4 transition-colors ${
        inCart ? 'bg-emerald-500/5' : 'hover:bg-gray-800/35'
      }`}
    >
      <div className="relative h-11 w-11 sm:h-12 sm:w-12 rounded-md overflow-hidden bg-gray-950 ring-1 ring-gray-500/60 flex-shrink-0">
        <AlbionItemImage
          src={itemImageSrcs[0]}
          fallbackSrcs={itemImageSrcs.slice(1)}
          alt={item.displayName}
          fill
          className="object-contain p-0.5 pixel-img"
          sizes="48px"
        />
        {inCart && (
          <span className="absolute -right-1 -bottom-1 min-w-5 rounded bg-emerald-500 px-1 text-center text-[11px] font-bold text-white ring-1 ring-emerald-300/70">
            ×{cartQty}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm sm:text-base font-bold text-amber-200 tabular-nums">
            {tierEnchant}
          </span>
          <span className="text-sm sm:text-[15px] font-semibold text-white truncate">
            {item.displayName}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
          <span className="rounded border border-gray-700 bg-gray-950/60 px-1.5 py-0.5 text-gray-300">
            {typeLabel}
          </span>
          <span className="sm:hidden">{stockLabel}</span>
          {item.priceWarning && (
            <HoverTip
              label={t(`priceWarningBuyer.${item.priceWarning}`)}
              placement="top"
              triggerClassName="inline-flex sm:hidden"
            >
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PRICE_WARNING_COLOR[item.priceWarning]}`}
              >
                {t('priceWarning')}
              </span>
            </HoverTip>
          )}
          {inCart && (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
              {tc('tile.cartPrefix', { qty: cartQty })}
            </span>
          )}
        </div>
      </div>

      <div className="hidden sm:block text-right">
        <p className="text-[11px] text-gray-500">{tc('stockLabel')}</p>
        <p className="font-mono text-sm font-semibold text-gray-200 tabular-nums">{formatInteger(item.stock)}</p>
      </div>

      <div className="text-right">
        {item.pointPrice === null ? (
          <span className="inline-flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
            <AlertTriangle size={10} />
            {tc('quoteRequired')}
          </span>
        ) : (
          <p data-shop-price className="font-mono text-sm sm:text-base font-bold text-amber-300 tabular-nums">
            {formatInteger(item.pointPrice)}
            <span className="ml-0.5 text-[10px] text-amber-300/70">P</span>
          </p>
        )}
        {item.priceWarning && (
          <HoverTip
            label={t(`priceWarningBuyer.${item.priceWarning}`)}
            placement="top"
            triggerClassName="hidden sm:inline-flex"
          >
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${PRICE_WARNING_COLOR[item.priceWarning]}`}
            >
              {t('priceWarning')}
            </span>
          </HoverTip>
        )}
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        aria-label={ariaLabel}
        title={atMax ? tc('tile.maxHint') : undefined}
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          atMax
            ? 'bg-gray-800 text-gray-500'
            : 'bg-amber-500 text-black hover:bg-amber-400'
        } disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed`}
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

function CartPanel({
  cart,
  totalPoints,
  totalKnown,
  hasInvalidOptionalQuote,
  balance,
  insufficient,
  discountRate,
  note,
  onNoteChange,
  onQtyDelta,
  onQtyInputChange,
  onQtyMax,
  onRemove,
  onQuoteChange,
  onClear,
  onSubmit,
  pending,
  isMember,
  variant = 'sidebar',
}: {
  cart: CartLine[]
  totalPoints: number
  totalKnown: boolean
  hasInvalidOptionalQuote: boolean
  balance: number
  insufficient: boolean
  discountRate: number
  note: string
  onNoteChange: (next: string) => void
  onQtyDelta: (id: string, delta: number) => void
  onQtyInputChange: (id: string, value: string) => void
  onQtyMax: (id: string) => void
  onRemove: (id: string) => void
  onQuoteChange: (
    id: string,
    patch: QuotePatch,
  ) => void
  onClear: () => void
  onSubmit: () => void
  pending: boolean
  isMember: boolean
  variant?: 'sidebar' | 'drawer'
}) {
  const t = useTranslations('shopCatalog')
  const totalQty = cart.reduce((s, l) => s + l.qty, 0)
  const isSidebar = variant === 'sidebar'

  return (
    <div
      className={
        isSidebar
          ? 'bg-gray-900 border border-gray-700 rounded-xl flex flex-col max-h-[calc(100dvh-2rem)] overflow-hidden'
          : 'flex flex-col h-full'
      }
    >
      {isSidebar && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h2 className="font-bold text-white text-sm flex items-center gap-2">
            <ShoppingCart size={16} className="text-amber-400" />
            {t('cartButton')}
            {totalQty > 0 && (
              <span className="text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5">
                {totalQty}
              </span>
            )}
          </h2>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
        {cart.length === 0 ? (
          <p className="text-gray-300 text-sm text-center py-10">
            {t('cart.empty')}
          </p>
        ) : (
          cart.map((line) => (
            <CartLineRow
              key={line.item.id}
              line={line}
              discountRate={discountRate}
              onQtyDelta={(delta) => onQtyDelta(line.item.id, delta)}
              onQtyInputChange={(value) => onQtyInputChange(line.item.id, value)}
              onQtyMax={() => onQtyMax(line.item.id)}
              onRemove={() => onRemove(line.item.id)}
              onQuoteChange={(patch) => onQuoteChange(line.item.id, patch)}
            />
          ))
        )}
      </div>

      <div className="border-t border-gray-800 px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{t('cart.totalLabel')}</span>
          <span data-shop-price className="font-mono font-bold text-amber-300 tabular-nums">
            {totalKnown ? `${formatInteger(totalPoints)}p` : t('cart.quotePendingTotal')}
          </span>
        </div>
        {!totalKnown && (
          <p className="flex items-center gap-1 text-[11px] text-amber-300/90">
            <AlertTriangle size={11} />
            {t('cart.quoteRequiredHint')}
          </p>
        )}
        {hasInvalidOptionalQuote && (
          <p className="flex items-center gap-1 text-[11px] text-red-300">
            <AlertTriangle size={11} />
            {t('cart.quoteInvalidHint')}
          </p>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">{t('balanceLabel')}</span>
          <span className={`font-mono ${insufficient ? 'text-red-400' : 'text-gray-300'}`}>
            {formatInteger(balance)}p
            {insufficient && <span className="ml-1 text-red-400">{t('cart.insufficient')}</span>}
          </span>
        </div>

        <div className="space-y-1">
          <textarea
            value={note}
            onChange={(e) => onNoteChange(e.target.value.slice(0, SHOP_NOTE_MAX))}
            rows={2}
            maxLength={SHOP_NOTE_MAX}
            placeholder={t('cart.notePlaceholder')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-none"
          />
          <div className="flex justify-end">
            <span
              className={`text-[10px] tabular-nums ${
                note.length >= SHOP_NOTE_MAX ? 'text-red-400' : 'text-gray-500'
              }`}
            >
              {note.length} / {SHOP_NOTE_MAX}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={pending || cart.length === 0}
            className="text-[11px] text-gray-400 hover:text-red-300 disabled:text-gray-700 px-2"
          >
            {t('cart.clearButton')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={
              pending ||
              cart.length === 0 ||
              insufficient ||
              !isMember ||
              !totalKnown ||
              hasInvalidOptionalQuote
            }
            className="ml-auto flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-3.5 py-1.5 rounded-lg text-xs"
          >
            {pending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Send size={12} />
            )}
            {t('cart.reviewButton')}
          </button>
        </div>

        {!isMember && (
          <p className="text-[11px] text-amber-300/80">
            {t('cart.notMemberHint')}
          </p>
        )}
      </div>
    </div>
  )
}

function CartLineRow({
  line,
  discountRate,
  onQtyDelta,
  onQtyInputChange,
  onQtyMax,
  onRemove,
  onQuoteChange,
}: {
  line: CartLine
  discountRate: number
  onQtyDelta: (delta: number) => void
  onQtyInputChange: (value: string) => void
  onQtyMax: () => void
  onRemove: () => void
  onQuoteChange: (patch: QuotePatch) => void
}) {
  const t = useTranslations('shopCatalog.cart')
  const tierEnchant = formatShopTierEnchantLabel(line.item)
  const displayName = line.item.displayName
  const quotePoints = quoteUnitPoints(line, discountRate)
  const quoteRequired = line.item.pointPrice === null
  const quoteOpen = quoteRequired || line.quoteOpen
  const quoteInvalid = line.quoteUnitSilver.trim() !== '' && quotePoints === null
  const effectiveUnitPoints = quotePoints ?? line.item.pointPrice
  const itemImageSrcs = imageSrcs(line.item.uniqueName, line.item.enchant, 48)
  const isAtStockMax = line.qty >= line.item.stock
  return (
    <div className="bg-gray-800/60 border border-gray-800 rounded-lg px-2 py-1.5 space-y-2">
      <div className="flex items-start gap-2">
        <div className="relative w-9 h-9 rounded bg-gray-950 flex-shrink-0">
          <AlbionItemImage
            src={itemImageSrcs[0]}
            fallbackSrcs={itemImageSrcs.slice(1)}
            alt={displayName}
            fill
            className="object-contain pixel-img"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="flex min-w-0 items-center gap-1 text-[11px] text-white font-medium">
            {tierEnchant !== '-' && (
              <span className="flex-shrink-0 font-mono text-amber-200">{tierEnchant}</span>
            )}
            <span className="truncate">{displayName}</span>
          </p>
          <p data-shop-price className="text-[10px] text-gray-500 font-mono tabular-nums">
            {effectiveUnitPoints === null ? (
              <span className="text-amber-300">{t('quoteRequiredLine')}</span>
            ) : (
              <>
                {formatInteger(effectiveUnitPoints)}p × {line.qty} ={' '}
                <span data-shop-price className="text-amber-300 font-bold tabular-nums">
                  {formatInteger(effectiveUnitPoints * line.qty)}p
                </span>
              </>
            )}
          </p>
          {!quoteRequired && !quoteOpen && (
            <button
              type="button"
              onClick={() => onQuoteChange({ quoteOpen: true })}
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-amber-300"
            >
              <Pencil size={10} />
              {t('openQuoteButton')}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-gray-500 hover:text-red-400 p-1"
          aria-label={t('removeAriaLabel')}
        >
          <Trash2 size={12} />
        </button>
      </div>

      <div className="v3-cart-line-grid grid grid-cols-[1.75rem_minmax(4rem,1fr)_1.75rem_2.5rem_2.5rem_3rem] gap-1">
        <button
          type="button"
          onClick={() => onQtyDelta(-1)}
          className="flex h-7 items-center justify-center rounded bg-gray-900 text-gray-300 hover:bg-gray-700"
          aria-label={t('decAriaLabel')}
        >
          <Minus size={12} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9,]*"
          value={String(line.qty)}
          onChange={(e) => onQtyInputChange(e.target.value)}
          aria-label={t('quantityInputAriaLabel')}
          className="h-7 min-w-0 rounded border border-gray-700 bg-gray-900 px-1 text-center font-mono text-xs tabular-nums text-white focus:border-amber-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onQtyDelta(1)}
          disabled={isAtStockMax}
          className="flex h-7 items-center justify-center rounded bg-gray-900 text-gray-300 hover:bg-gray-700 disabled:bg-gray-900/50 disabled:text-gray-700"
          aria-label={t('incAriaLabel')}
        >
          <Plus size={12} />
        </button>
        <button
          type="button"
          onClick={() => onQtyDelta(10)}
          disabled={isAtStockMax}
          className="flex h-7 min-w-0 items-center justify-center rounded border border-gray-700 bg-gray-900 px-1 font-mono text-[10px] text-gray-300 hover:border-amber-500/60 hover:text-amber-200 disabled:border-gray-800 disabled:text-gray-700"
          aria-label={t('addQuantityAriaLabel', { count: 10 })}
        >
          +10
        </button>
        <button
          type="button"
          onClick={() => onQtyDelta(50)}
          disabled={isAtStockMax}
          className="flex h-7 min-w-0 items-center justify-center rounded border border-gray-700 bg-gray-900 px-1 font-mono text-[10px] text-gray-300 hover:border-amber-500/60 hover:text-amber-200 disabled:border-gray-800 disabled:text-gray-700"
          aria-label={t('addQuantityAriaLabel', { count: 50 })}
        >
          +50
        </button>
        <button
          type="button"
          onClick={onQtyMax}
          disabled={isAtStockMax}
          className="flex h-7 min-w-0 items-center justify-center rounded border border-gray-700 bg-gray-900 px-1 text-[10px] font-semibold text-gray-300 hover:border-amber-500/60 hover:text-amber-200 disabled:border-gray-800 disabled:text-gray-700"
          aria-label={t('maxQuantityAriaLabel')}
        >
          {t('maxQuantityButton')}
        </button>
      </div>

      {quoteOpen && (
        <div className="space-y-1.5 border-t border-gray-700/70 pt-2">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              inputMode="numeric"
              value={line.quoteUnitSilver}
              onChange={(e) => onQuoteChange({ quoteUnitSilver: e.target.value })}
              placeholder={t('quoteUnitSilverPlaceholder')}
              className={`min-w-0 flex-1 bg-gray-900 border rounded px-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none ${
                quoteInvalid || (quoteRequired && quotePoints === null)
                  ? 'border-red-500/60 focus:border-red-400'
                  : 'border-gray-700 focus:border-amber-500'
              }`}
            />
            <span data-shop-price className="w-20 text-right text-[10px] font-mono text-amber-300 tabular-nums">
              {quotePoints !== null ? `${formatInteger(quotePoints)}p` : t('quotePending')}
            </span>
          </div>
          <input
            type="text"
            value={line.quoteCity}
            onChange={(e) => onQuoteChange({ quoteCity: e.target.value.slice(0, 40) })}
            placeholder={t('quoteCityPlaceholder')}
            className="w-full min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={line.quoteNote}
              onChange={(e) => onQuoteChange({ quoteNote: e.target.value.slice(0, 200) })}
              placeholder={t('quoteNotePlaceholder')}
              className="min-w-0 flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            {!quoteRequired && (
              <button
                type="button"
                onClick={() =>
                  onQuoteChange({
                    quoteOpen: false,
                    quoteUnitSilver: '',
                    quoteCity: '',
                    quoteNote: '',
                  })
                }
                className="px-1.5 py-1 text-[10px] text-gray-500 hover:text-gray-300"
              >
                {t('closeQuoteButton')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
