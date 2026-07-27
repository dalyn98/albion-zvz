'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { Pencil, Search, Sparkles, X } from 'lucide-react'
import ItemImage from './ItemImage'
import { useBodyScrollLock } from './useBodyScrollLock'
import { useItemNameResolver } from '@/lib/item-names-client'
import {
  filterItemsForPicker,
  itemMatchesPickerFilters,
} from '@/lib/item-picker-eligibility'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import type { AlbionItem } from '@/types'
import { FREE_ITEM_NAME, isFreeItem } from '@/types'

const RECENT_ITEMS_KEY = 'albion:item-search-recent:v1'
const MAX_RECENT_ITEMS = 8
const ITEM_SEARCH_SCHEMA_VERSION = '2'

interface Props {
  label: string
  searchLabel?: string
  category?: string
  tier?: number
  itemName: string | null
  itemId: string | null
  onChange: (name: string, id: string) => void
  onClear: () => void
  hideFree?: boolean
}

function readRecentItems(): AlbionItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is AlbionItem =>
        typeof item?.uniqueName === 'string' && typeof item?.displayName === 'string',
    ).slice(0, MAX_RECENT_ITEMS)
  } catch {
    return []
  }
}

function storeRecentItem(item: AlbionItem): AlbionItem[] {
  const next = [
    item,
    ...readRecentItems().filter((recent) => recent.uniqueName !== item.uniqueName),
  ].slice(0, MAX_RECENT_ITEMS)
  try {
    localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(next))
  } catch {
    // Search still works when storage is unavailable (private mode/quota).
  }
  return next
}

export default function ItemPicker({
  label,
  searchLabel,
  category,
  tier,
  itemName,
  itemId,
  onChange,
  onClear,
  hideFree,
}: Props) {
  const t = useTranslations('picker')
  const tCommon = useTranslations('common')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const { getLocalizedItemName } = useItemNameResolver(locale)
  const dialogTitleId = useId()
  const dialogDescriptionId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestSeqRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AlbionItem[]>([])
  const [recentItems, setRecentItems] = useState<AlbionItem[]>([])
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const displayName = getLocalizedItemName(itemId, locale, itemName)
  const isFree = isFreeItem(itemName, itemId)
  const hasSelection = Boolean(itemId) || (isFree && !hideFree)
  const pickerLabel = searchLabel || label || tCommon('item')
  const visibleItems = filterItemsForPicker(
    query.trim().length >= 2 ? results : recentItems,
    category,
    tier,
  )

  useBodyScrollLock(open)

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [open])

  const closeSearch = () => {
    requestSeqRef.current += 1
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    setOpen(false)
    setQuery('')
    setResults([])
    setSearching(false)
    setActiveIndex(-1)
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
  }

  const openSearch = () => {
    setRecentItems(readRecentItems())
    setQuery('')
    setResults([])
    setActiveIndex(-1)
    setOpen(true)
  }

  const handleSearch = (value: string) => {
    setQuery(value)
    setActiveIndex(-1)
    requestSeqRef.current += 1
    const requestSeq = requestSeqRef.current
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    const queryValue = value.trim()
    if (queryValue.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const params = new URLSearchParams({ q: queryValue, v: ITEM_SEARCH_SCHEMA_VERSION })
        if (category) params.set('category', category)
        if (tier != null) params.set('tier', String(tier))
        const response = await fetch(`/api/items/search?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = response.ok ? await response.json() : []
        if (requestSeqRef.current !== requestSeq) return
        setResults(Array.isArray(data) ? data : [])
      } catch {
        if (requestSeqRef.current === requestSeq) setResults([])
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (requestSeqRef.current === requestSeq) setSearching(false)
      }
    }, 250)
  }

  const select = (item: AlbionItem) => {
    if (!itemMatchesPickerFilters(item, category, tier)) return
    onChange(item.displayName, item.uniqueName)
    setRecentItems(storeRecentItem(item))
    closeSearch()
  }

  const setFree = () => {
    onChange(FREE_ITEM_NAME, '')
    closeSearch()
  }

  const clear = () => {
    onClear()
    closeSearch()
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && visibleItems.length > 0) {
      event.preventDefault()
      setActiveIndex((current) => Math.min(visibleItems.length - 1, current + 1))
    } else if (event.key === 'ArrowUp' && visibleItems.length > 0) {
      event.preventDefault()
      setActiveIndex((current) => Math.max(0, current - 1))
    } else if (event.key === 'Enter' && activeIndex >= 0 && visibleItems[activeIndex]) {
      event.preventDefault()
      select(visibleItems[activeIndex])
    }
  }

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeSearch()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const dialog = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="fixed inset-0 z-[220] flex items-end justify-center bg-black/75 sm:items-center sm:p-5"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) closeSearch()
        }}
        data-item-picker-dialog
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          aria-describedby={dialogDescriptionId}
          onKeyDown={handleDialogKeyDown}
          className="flex h-[100dvh] w-full flex-col overflow-hidden bg-gray-900 shadow-2xl shadow-black/50 sm:h-auto sm:max-h-[min(46rem,calc(100dvh-2.5rem))] sm:max-w-3xl sm:rounded-2xl sm:border sm:border-gray-700"
        >
          <header className="flex flex-shrink-0 items-start gap-3 border-b border-gray-700 px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0 flex-1">
              <h3 id={dialogTitleId} className="text-base font-bold text-white sm:text-lg">
                {t('searchTitle')}
              </h3>
              <p id={dialogDescriptionId} className="mt-0.5 text-xs leading-relaxed text-gray-400">
                {t('searchDescription', { label: pickerLabel })}
              </p>
            </div>
            <button
              type="button"
              onClick={closeSearch}
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-white active:scale-[0.96]"
              aria-label={t('closeSearch')}
              data-item-picker-close
            >
              <X size={20} />
            </button>
          </header>

          <div className="flex-shrink-0 space-y-3 border-b border-gray-800 px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex min-h-[52px] items-center gap-3 rounded-xl border border-gray-600 bg-gray-950 px-4 transition-colors focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-400/20">
              <Search size={20} className="flex-shrink-0 text-gray-500" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => handleSearch(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={t('itemSearchPlaceholder')}
                className="h-[52px] min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-gray-600 focus:outline-none focus-visible:outline-none"
                aria-controls={`${dialogTitleId}-results`}
                aria-activedescendant={activeIndex >= 0 ? `${dialogTitleId}-option-${activeIndex}` : undefined}
                autoComplete="off"
                style={{ outline: 'none' }}
                data-item-picker-search
              />
              {searching && (
                <span
                  className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"
                  aria-label={t('loading')}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
                {t('filterCategory', { category: pickerLabel })}
              </span>
              {tier != null && (
                <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
                  {t('filterTier', { tier })}
                </span>
              )}
              {!hideFree && (
                <button
                  type="button"
                  onClick={setFree}
                  className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-emerald-700/60 px-3 text-xs font-bold text-emerald-300 transition-[background-color,border-color,scale] duration-150 hover:border-emerald-500 hover:bg-emerald-500/10 active:scale-[0.96]"
                  aria-label={t('freeSelectAria')}
                >
                  <Sparkles size={15} />
                  {t('free')}
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
            {query.trim().length < 2 && recentItems.length > 0 && (
              <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {t('recentTitle')}
              </p>
            )}
            {query.trim().length < 2 && recentItems.length === 0 && (
              <div className="flex min-h-40 items-center justify-center px-6 text-center">
                <p className="max-w-sm text-sm leading-relaxed text-gray-500 text-pretty">
                  {t('searchHint')}
                </p>
              </div>
            )}
            {!searching && query.trim().length >= 2 && visibleItems.length === 0 && (
              <div className="flex min-h-40 items-center justify-center px-6 text-center">
                <p className="text-sm text-gray-500">{t('noResults')}</p>
              </div>
            )}
            {visibleItems.length > 0 && (
              <>
                {query.trim().length >= 2 && (
                  <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    {t('resultCount', { count: visibleItems.length })}
                  </p>
                )}
                <ul id={`${dialogTitleId}-results`} role="listbox" className="space-y-1">
                  {visibleItems.map((item, index) => (
                    <li key={item.uniqueName} role="presentation">
                      <button
                        id={`${dialogTitleId}-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        onPointerDown={(event) => event.preventDefault()}
                        onPointerMove={() => setActiveIndex(index)}
                        onClick={() => select(item)}
                        className={`flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-[background-color,box-shadow,scale] duration-150 active:scale-[0.98] ${
                          activeIndex === index
                            ? 'bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.5)]'
                            : 'hover:bg-gray-800'
                        }`}
                        data-item-picker-result
                      >
                        <ItemImage itemId={item.uniqueName} itemName={item.displayName} size={44} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">
                            {item.displayName}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[11px] text-gray-500">
                            {item.uniqueName}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {label && <span className="text-xs font-semibold text-amber-300">{label}</span>}
      {hasSelection ? (
        <div className="flex min-h-16 min-w-0 items-center gap-1 rounded-xl bg-gray-800 p-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]">
          <button
            ref={triggerRef}
            type="button"
            onClick={openSearch}
            data-item-picker-trigger
            className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left transition-[background-color,scale] duration-150 hover:bg-gray-700/70 active:scale-[0.98]"
            aria-label={`${displayName || tCommon('item')} · ${tCommon('edit')}`}
          >
            {itemId ? (
              <ItemImage itemId={itemId} itemName={itemName} size={44} />
            ) : (
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-900/40 text-xs font-bold text-emerald-300 shadow-[0_0_0_1px_rgba(52,211,153,0.35)]">
                {t('free')}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-semibold ${itemId ? 'text-white' : 'text-emerald-300'}`}>
                {itemId ? displayName : t('freeSelection')}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[11px] text-gray-500">
                {itemId || t('freeDescription')}
              </span>
            </span>
            <Pencil size={16} className="flex-shrink-0 text-gray-500" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={clear}
            className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 transition-[background-color,color,scale] duration-150 hover:bg-red-500/10 hover:text-red-400 active:scale-[0.96]"
            aria-label={t('clearSelection')}
          >
            <X size={17} />
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={openSearch}
          data-item-picker-trigger
          className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl border border-gray-600 bg-gray-800 px-4 text-left text-base text-gray-400 transition-[border-color,background-color,color,scale] duration-150 hover:border-amber-500/70 hover:bg-gray-800/80 hover:text-white active:scale-[0.99]"
        >
          <Search size={19} className="flex-shrink-0 text-amber-400" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t('chooseItem')}</span>
        </button>
      )}
      {dialog}
    </div>
  )
}
