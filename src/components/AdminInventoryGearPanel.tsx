'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Lock, Minus, Plus, Save, Search, Shield, Trash2 } from 'lucide-react'
import {
  GEAR_SLOTS,
  categorizeGearItem,
  type GearArmorMaterial,
  type GearSlot,
  type InventoryGearRow,
} from '@/lib/inventory'
import { adjustGearAction, setGearAction } from '@/app/actions/inventory'
import { extractWeaponCategory } from '@/lib/weapon-category'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import ItemPicker from './ItemPicker'
import { useToast } from './ToastProvider'

interface Props {
  initialGear: InventoryGearRow[]
}

interface CategorizedRow extends InventoryGearRow {
  slot: GearSlot
  armorMaterial: GearArmorMaterial | null
  tier: number | null
  enchant: number
  // 무기/오프핸드 정렬 보조 — 같은 카테고리 (도끼/검/...) 끼리 시각적으로 모이게.
  weaponCategory: string | null
  localizedName: string
}

// Tailwind purge 안전한 정적 매핑.
const MATERIAL_BADGE_STYLE: Record<GearArmorMaterial, string> = {
  PLATE: 'bg-slate-500/15 text-slate-200 border-slate-500/40',
  LEATHER: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  CLOTH: 'bg-violet-500/15 text-violet-200 border-violet-500/40',
}

function extractEnchant(itemId: string): number {
  const m = itemId.match(/@(\d)$/)
  if (m) return Number(m[1])
  return 0
}

// 정렬: 슬롯 → (무기카테고리|재질) → 티어 desc → 인챈트 asc → 이름.
// 같은 카테고리/재질끼리 그룹지어 보이도록 sub-key 를 1차 정렬에 포함.
function compareRows(a: CategorizedRow, b: CategorizedRow): number {
  const slotDiff = GEAR_SLOTS.indexOf(a.slot) - GEAR_SLOTS.indexOf(b.slot)
  if (slotDiff !== 0) return slotDiff
  const subA = a.weaponCategory ?? a.armorMaterial ?? ''
  const subB = b.weaponCategory ?? b.armorMaterial ?? ''
  if (subA < subB) return -1
  if (subA > subB) return 1
  const tierDiff = (b.tier ?? 0) - (a.tier ?? 0)
  if (tierDiff !== 0) return tierDiff
  if (a.enchant !== b.enchant) return a.enchant - b.enchant
  return a.localizedName.localeCompare(b.localizedName)
}

export default function AdminInventoryGearPanel({ initialGear }: Props) {
  const t = useTranslations('adminInventory')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const toast = useToast()
  const router = useRouter()
  const [pickerName, setPickerName] = useState<string | null>(null)
  const [pickerId, setPickerId] = useState<string | null>(null)
  const [pickerEnchant, setPickerEnchant] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [slotFilter, setSlotFilter] = useState<GearSlot | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [, startTransition] = useTransition()
  const gridRef = useRef<HTMLDivElement | null>(null)

  // quantity 0 행도 포함 (한 번이라도 보유했던 아이템 카탈로그). 0 표시는 카드
  // 스타일링으로 구분.
  const rows = useMemo<CategorizedRow[]>(() => {
    return initialGear
      .map((r) => {
        const cat = categorizeGearItem(r.itemId)
        const localizedName =
          getLocalizedItemNameWithEnchant(r.itemId, locale, null) ?? r.itemId
        const weaponCategory =
          cat.slot === 'weapon' || cat.slot === 'offhand'
            ? extractWeaponCategory(r.itemId)
            : null
        return {
          ...r,
          ...cat,
          enchant: extractEnchant(r.itemId),
          weaponCategory,
          localizedName,
        }
      })
      .sort(compareRows)
  }, [initialGear, locale])

  const trimmedQuery = searchQuery.trim().toLowerCase()
  const matches = (r: CategorizedRow) =>
    !trimmedQuery ||
    r.itemId.toLowerCase().includes(trimmedQuery) ||
    r.localizedName.toLowerCase().includes(trimmedQuery)

  // 슬롯 chip 의 "갯수" 배지 — 수량 합계 (갯수 = 보유 합).
  const countsBySlot = useMemo(() => {
    const counts: Record<GearSlot | 'all', number> = {
      all: 0,
      weapon: 0,
      head: 0,
      armor: 0,
      shoes: 0,
      offhand: 0,
      cape: 0,
      bag: 0,
      other: 0,
    }
    for (const r of rows) {
      counts.all += r.quantity
      counts[r.slot] += r.quantity
    }
    return counts
  }, [rows])

  // 슬롯별 그룹 — 헤더 + 카드 그리드 렌더 용.
  const rowsBySlot = useMemo(() => {
    const grouped: Record<GearSlot, CategorizedRow[]> = {
      weapon: [],
      head: [],
      armor: [],
      shoes: [],
      offhand: [],
      cape: [],
      bag: [],
      other: [],
    }
    for (const r of rows) grouped[r.slot].push(r)
    return grouped
  }, [rows])

  const matchedTotal = useMemo(
    () => (trimmedQuery ? rows.filter(matches).length : rows.length),
    // matches 는 trimmedQuery 에 의존하므로 deps 에 포함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, trimmedQuery],
  )

  // 검색 시 첫 매치 카드로 스크롤 — 그리드에서 핀포인트 조회를 가능하게.
  useEffect(() => {
    if (!trimmedQuery || !gridRef.current) return
    const el = gridRef.current.querySelector<HTMLElement>(
      '[data-search-match="true"]',
    )
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [trimmedQuery])

  const onAdjust = (itemId: string, delta: number) => {
    startTransition(async () => {
      const r = await adjustGearAction({ itemId, delta })
      if (r.error) toast.error(r.error)
      else router.refresh()
    })
  }

  const onSet = (itemId: string, qty: number) => {
    startTransition(async () => {
      const r = await setGearAction({ itemId, quantity: qty })
      if (r.error) toast.error(r.error)
      else router.refresh()
    })
  }

  const onAddSelected = () => {
    if (!pickerId) {
      toast.error(t('errPickItemFirst'))
      return
    }
    const base = pickerId.split('@')[0]
    const finalId = pickerEnchant > 0 ? `${base}@${pickerEnchant}` : base
    startTransition(async () => {
      const r = await adjustGearAction({ itemId: finalId, delta: 1 })
      if (r.error) {
        toast.error(r.error)
        return
      }
      setPickerName(null)
      setPickerId(null)
      setPickerEnchant(0)
      router.refresh()
    })
  }

  const slotChips: Array<GearSlot | 'all'> = ['all', ...GEAR_SLOTS]
  const isSearching = Boolean(trimmedQuery)

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Shield size={16} className="text-amber-400" />
          {t('gearTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('gearHint')}</p>
      </div>

      <div className="bg-gray-950/40 border border-gray-800 rounded-xl p-3 space-y-2">
        <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">
          {t('addGearLabel')}
        </p>
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
          <ItemPicker
            label={t('addGearPickerLabel')}
            category="weapon,offhand,head,armor,shoes,cape,bag"
            itemName={pickerName}
            itemId={pickerId}
            onChange={(name, id) => {
              setPickerName(name)
              setPickerId(id)
            }}
            onClear={() => {
              setPickerName(null)
              setPickerId(null)
            }}
          />
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
              {t('addGearEnchantLabel')}
            </label>
            <select
              value={pickerEnchant}
              onChange={(e) =>
                setPickerEnchant(Number(e.target.value) as 0 | 1 | 2 | 3 | 4)
              }
              className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-2 focus:border-amber-500 focus:outline-none"
            >
              <option value={0}>@0</option>
              <option value={1}>@1</option>
              <option value={2}>@2</option>
              <option value={3}>@3</option>
              <option value={4}>@4</option>
            </select>
          </div>
          <button
            type="button"
            onClick={onAddSelected}
            disabled={!pickerId}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-semibold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 justify-center"
          >
            <Plus size={12} />
            {t('btnAddGear')}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-gray-500 text-sm py-6">{t('gearEmpty')}</p>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full bg-gray-950/40 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder:text-gray-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {slotChips.map((s) => {
              const active = slotFilter === s
              const count = countsBySlot[s]
              const slotHasRows =
                s === 'all' ? rows.length > 0 : rowsBySlot[s].length > 0
              if (!slotHasRows) return null
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlotFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    active
                      ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                      : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  <span>{t(`gearSlot.${s}`)}</span>
                  <span
                    className={`text-[10px] tabular-nums ${active ? 'text-amber-300/80' : 'text-gray-500'}`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {isSearching && (
            <p className="text-xs text-gray-500 tabular-nums">
              {t('matchCount', { matched: matchedTotal, total: rows.length })}
            </p>
          )}

          <p className="sm:hidden flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-950/40 border border-gray-800 rounded-lg px-3 py-2">
            <Lock size={12} />
            {t('mobileHint')}
          </p>

          <div ref={gridRef} className="space-y-5">
            {GEAR_SLOTS.map((slot) => {
              const slotRows = rowsBySlot[slot]
              if (slotRows.length === 0) return null
              if (slotFilter !== 'all' && slotFilter !== slot) return null
              return (
                <div key={slot} className="space-y-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-2 border-b border-gray-800 pb-1">
                    <span>{t(`gearSlot.${slot}`)}</span>
                    <span className="text-[10px] text-gray-600 tabular-nums">
                      {t('kindCount', { count: slotRows.length })}
                    </span>
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                    {slotRows.map((row, idx) => (
                      <InventoryCard
                        key={row.itemId}
                        row={row}
                        matched={matches(row)}
                        searching={isSearching}
                        // 슬롯별 첫 매칭 카드만 scrollIntoView 타겟. 슬롯 0번이
                        // 매칭 안 되면 1번이 첫 매치이므로 idx 검사 X — querySelector
                        // 가 첫 [data-search-match="true"] 만 잡는 동작에 의존.
                        firstMatchInSlot={idx === slotRows.findIndex(matches)}
                        onAdjust={onAdjust}
                        onSet={onSet}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}

interface CardProps {
  row: CategorizedRow
  matched: boolean
  searching: boolean
  firstMatchInSlot: boolean
  onAdjust: (itemId: string, delta: number) => void
  onSet: (itemId: string, qty: number) => void
}

const POPOVER_GAP = 8
const POPOVER_WIDTH = 280
// 팝오버 높이는 콘텐츠에 따라 가변 (~280-320). 화면 하단 클립 방지용 추정치만
// 잡아 lower bound 클램프에 사용.
const POPOVER_EST_HEIGHT = 320

function InventoryCard({
  row,
  matched,
  searching,
  firstMatchInSlot,
  onAdjust,
  onSet,
}: CardProps) {
  const t = useTranslations('adminInventory')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(row.quantity))
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  })
  const wrapperRef = useRef<HTMLButtonElement | null>(null)

  const isZero = row.quantity === 0
  const dimByMissedSearch = searching && !matched

  function placePopover() {
    if (!wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const rightEdge = rect.right + POPOVER_GAP + POPOVER_WIDTH
    const showOnLeft = rightEdge > window.innerWidth
    const rawLeft = showOnLeft
      ? rect.left - POPOVER_GAP - POPOVER_WIDTH
      : rect.right + POPOVER_GAP
    const rawTop = rect.top
    setCoords({
      left: Math.max(8, Math.min(window.innerWidth - POPOVER_WIDTH - 8, rawLeft)),
      top: Math.max(
        8,
        Math.min(window.innerHeight - POPOVER_EST_HEIGHT - 8, rawTop),
      ),
    })
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setEditing(false)
      }
    }
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (wrapperRef.current?.contains(target)) return
      const popover = document.querySelector(
        `[data-inventory-popover="${row.itemId}"]`,
      )
      if (popover && popover.contains(target)) return
      setOpen(false)
      setEditing(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open, row.itemId])

  const handleClick = () => {
    if (open) {
      setOpen(false)
      setEditing(false)
      return
    }
    placePopover()
    setOpen(true)
  }

  const handleSave = () => {
    const qty = Number(draft)
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error(t('errInvalidQty'))
      return
    }
    onSet(row.itemId, qty)
    setEditing(false)
  }

  const imageUrl = `https://render.albiononline.com/v1/item/${row.itemId}.png`

  return (
    <>
      <button
        ref={wrapperRef}
        type="button"
        onClick={handleClick}
        data-search-match={searching && matched && firstMatchInSlot ? 'true' : undefined}
        className={`relative aspect-square rounded-lg border transition-colors ${
          searching && matched
            ? 'border-amber-400/80 ring-2 ring-amber-400/30'
            : isZero
              ? 'border-gray-800 bg-gray-950/50'
              : 'border-gray-700 bg-gray-950'
        } ${dimByMissedSearch ? 'opacity-30' : ''} hover:border-amber-500/60`}
        aria-label={`${row.localizedName} (${row.quantity})`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={row.localizedName}
          className={`absolute inset-0 w-full h-full object-contain p-1 pixel-img ${
            isZero ? 'opacity-40 grayscale' : ''
          }`}
          loading="lazy"
        />
        <span
          className={`absolute bottom-0.5 right-0.5 rounded px-1.5 py-0.5 text-sm font-bold tabular-nums leading-none ${
            isZero
              ? 'bg-gray-800/80 text-gray-500'
              : 'bg-black/75 text-amber-200'
          }`}
        >
          {row.quantity}
        </span>
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-inventory-popover={row.itemId}
              role="dialog"
              aria-label={row.localizedName}
              className="fixed z-[100] rounded-xl bg-gray-900 border border-gray-700 shadow-2xl p-3 space-y-3"
              style={{
                top: coords.top,
                left: coords.left,
                width: POPOVER_WIDTH,
              }}
            >
              <div className="space-y-1">
                <p className="text-white text-sm font-medium leading-tight">
                  {row.localizedName}
                </p>
                <p className="text-gray-500 text-[11px] font-mono leading-tight break-all">
                  {row.itemId}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="px-1.5 py-0.5 rounded border border-gray-700 text-gray-300">
                  {t(`gearSlot.${row.slot}`)}
                </span>
                {row.tier !== null && (
                  <span className="px-1.5 py-0.5 rounded border border-gray-700 text-gray-300 tabular-nums">
                    T{row.tier}
                  </span>
                )}
                {row.enchant > 0 ? (
                  <span className="px-1.5 py-0.5 rounded border border-amber-700/60 text-amber-300 tabular-nums">
                    @{row.enchant}
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded border border-gray-700 text-gray-500">
                    {t('thEnchBase')}
                  </span>
                )}
                {row.armorMaterial && (
                  <span
                    className={`px-1.5 py-0.5 rounded border ${MATERIAL_BADGE_STYLE[row.armorMaterial]}`}
                  >
                    {t(`armorMaterial.${row.armorMaterial}`)}
                  </span>
                )}
              </div>

              <div className="hidden sm:block border-t border-gray-800 pt-3">
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => onAdjust(row.itemId, -1)}
                    className="p-1.5 rounded text-gray-400 hover:text-rose-300 hover:bg-rose-500/10 border border-gray-700"
                    aria-label={t('btnMinus')}
                  >
                    <Minus size={14} />
                  </button>
                  {editing ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSave()
                        }}
                        className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm text-center"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleSave}
                        className="p-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                        aria-label={t('btnSave')}
                      >
                        <Save size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(true)
                        setDraft(String(row.quantity))
                      }}
                      className="px-3 py-1 rounded font-mono font-bold text-amber-200 hover:bg-amber-500/10 tabular-nums min-w-[44px] text-center text-base border border-gray-700"
                    >
                      {row.quantity}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onAdjust(row.itemId, 1)}
                    className="p-1.5 rounded text-gray-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-gray-700"
                    aria-label={t('btnPlus')}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSet(row.itemId, 0)}
                    className="p-1.5 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 border border-gray-700"
                    aria-label={t('btnRemove')}
                    title={t('btnRemove')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="sm:hidden border-t border-gray-800 pt-3">
                <p className="text-[11px] text-gray-500 flex items-center gap-1.5">
                  <Lock size={12} />
                  {t('mobileEditDisabled')}
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
