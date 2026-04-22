'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import ItemImage from './ItemImage'
import type { AlbionItem } from '@/types'
import { FREE_ITEM_NAME, isFreeItem } from '@/types'
import { Search, X, Sparkles } from 'lucide-react'
import { getLocalizedItemName } from '@/lib/item-names'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'

interface Props {
  label: string
  category?: string
  tier?: number
  itemName: string | null
  itemId: string | null
  onChange: (name: string, id: string) => void
  onClear: () => void
}

export default function ItemPicker({ label, category, tier, itemName, itemId, onChange, onClear }: Props) {
  const t = useTranslations('picker')
  const rawLocale = useLocale()
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE
  const displayName = getLocalizedItemName(itemId, locale, itemName)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AlbionItem[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Pointer events unify mouse/touch/pen; on iOS, preventDefault on mousedown
  // does not reliably suppress blur (focus transfer fires on touchend), which
  // caused the first tap on a result to be swallowed by the keyboard dismiss.
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  const handleSearch = (value: string) => {
    setQuery(value)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.length < 2) { setResults([]); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: value })
        if (category) params.set('category', category)
        if (tier != null) params.set('tier', String(tier))
        const res = await fetch(`/api/items/search?${params.toString()}`)
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch { setResults([]) }
      setSearching(false)
    }, 300)
  }

  const select = (item: AlbionItem) => {
    onChange(item.displayName, item.uniqueName)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  const clear = () => {
    onClear()
    setQuery('')
    setResults([])
  }

  const isFree = isFreeItem(itemName, itemId)
  const setFree = () => onChange(FREE_ITEM_NAME, '')

  return (
    <div ref={containerRef} className="flex flex-col gap-1.5">
      <span className="text-amber-400 text-[11px] font-semibold">{label}</span>

      {itemId ? (
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-2 group">
          <ItemImage itemId={itemId} itemName={itemName} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{displayName}</p>
            <p className="text-gray-500 text-[10px] font-mono truncate">{itemId}</p>
          </div>
          <button
            onClick={clear}
            className="text-gray-500 hover:text-red-400 p-1 transition-all"
            aria-label={t('clearSelection')}
          >
            <X size={12} />
          </button>
        </div>
      ) : isFree ? (
        <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-700/40 rounded-lg p-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-emerald-900/40 border border-emerald-600/50 text-emerald-300 font-bold text-xs flex-shrink-0">
            {t('free')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-emerald-300 text-xs font-medium">{t('freeSelection')}</p>
            <p className="text-gray-500 text-[10px]">{t('freeDescription')}</p>
          </div>
          <button
            onClick={clear}
            className="text-gray-500 hover:text-red-400 p-1 transition-all"
            aria-label={t('clearSelection')}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 focus-within:border-amber-500">
            <Search size={12} className="text-gray-500 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => query.length >= 2 && setOpen(true)}
              placeholder={t('itemSearchPlaceholder')}
              className="bg-transparent text-white text-xs placeholder-gray-600 focus:outline-none w-full min-w-0"
            />
            {searching && (
              <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            <button
              type="button"
              onClick={setFree}
              className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-700/40 hover:border-emerald-500 flex-shrink-0 transition-colors"
              aria-label={t('freeSelectAria')}
            >
              <Sparkles size={10} />
              {t('free')}
            </button>
          </div>

          {open && results.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-72 overflow-y-auto">
              {results.map((item) => (
                <button
                  key={item.uniqueName}
                  type="button"
                  // preventDefault on pointerdown keeps the input focused across
                  // mouse AND touch — on iOS the soft keyboard dismiss that
                  // followed input blur was shifting the dropdown out from
                  // under the first tap.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => select(item)}
                  style={{ touchAction: 'manipulation' }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-700 transition-colors text-left"
                >
                  <ItemImage itemId={item.uniqueName} itemName={item.displayName} size={28} />
                  <div className="min-w-0">
                    <p className="text-white text-xs truncate">{item.displayName}</p>
                    <p className="text-gray-500 text-[10px] font-mono truncate">{item.uniqueName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {open && !searching && query.length >= 2 && results.length === 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-gray-500 text-xs text-center">
              {t('noResults')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
