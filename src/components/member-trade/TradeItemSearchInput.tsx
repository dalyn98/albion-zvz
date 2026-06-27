'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import AlbionItemImage from '@/components/AlbionItemImage'
import { buildAlbionItemImageUrlCandidates } from '@/lib/albion-render'
import {
  getNextMemberTradeItemSearchIndex,
  normalizeMemberTradeItemSearchQuery,
} from '@/lib/member-trade'

export interface TradeItemSearchResult {
  uniqueName: string
  displayName: string
}

interface Props {
  value: string
  selectedItem: TradeItemSearchResult | null
  enchant: number
  placeholder: string
  ariaLabel: string
  noResultsLabel: string
  invalidQueryLabel: string
  fallbackLabel: string
  loadingLabel: string
  keyboardHintLabel: string
  onQueryChange: (value: string) => void
  onSelect: (item: TradeItemSearchResult) => void
}

const SEARCH_DEBOUNCE_MS = 250

function itemImageSrcs(uniqueName: string, enchant: number, size = 40): string[] {
  return buildAlbionItemImageUrlCandidates({
    uniqueName,
    enchant,
    quality: 1,
    size,
  })
}

function isSearchResult(value: unknown): value is TradeItemSearchResult {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<TradeItemSearchResult>
  return typeof item.uniqueName === 'string' && typeof item.displayName === 'string'
}

export default function TradeItemSearchInput({
  value,
  selectedItem,
  enchant,
  placeholder,
  ariaLabel,
  noResultsLabel,
  invalidQueryLabel,
  fallbackLabel,
  loadingLabel,
  keyboardHintLabel,
  onQueryChange,
  onSelect,
}: Props) {
  const [results, setResults] = useState<TradeItemSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestSeqRef = useRef(0)
  const listboxId = useId()
  const hintId = useId()
  const normalizedQuery = normalizeMemberTradeItemSearchQuery(value)
  const selectedSrcs = selectedItem ? itemImageSrcs(selectedItem.uniqueName, enchant, 48) : []
  const hasRawQuery = value.trim().length > 0
  const isInvalidQuery = hasRawQuery && !normalizedQuery
  const activeOptionId =
    open && normalizedQuery && results[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined

  useEffect(() => {
    const handler = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [])

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const search = (nextValue: string) => {
    onQueryChange(nextValue)
    setOpen(nextValue.trim().length > 0)
    requestSeqRef.current += 1
    const requestSeq = requestSeqRef.current
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    const query = normalizeMemberTradeItemSearchQuery(nextValue)
    if (!query) {
      setResults([])
      setActiveIndex(-1)
      setSearching(false)
      return
    }

    setResults([])
    setActiveIndex(-1)
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const params = new URLSearchParams({ q: query })
        const response = await fetch(`/api/items/search?${params.toString()}`, {
          signal: controller.signal,
        })
        const data: unknown = await response.json()
        if (requestSeqRef.current !== requestSeq) return
        const nextResults = Array.isArray(data) ? data.filter(isSearchResult) : []
        setResults(nextResults)
        setActiveIndex(nextResults.length > 0 ? 0 : -1)
      } catch {
        if (requestSeqRef.current === requestSeq) {
          setResults([])
          setActiveIndex(-1)
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (requestSeqRef.current === requestSeq) setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
  }

  const select = (item: TradeItemSearchResult, options?: { blurInput?: boolean }) => {
    requestSeqRef.current += 1
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()
    setResults([])
    setActiveIndex(-1)
    setOpen(false)
    setSearching(false)
    onSelect(item)
    if (options?.blurInput) inputRef.current?.blur()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'ArrowDown') {
      if (!normalizedQuery) return
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) =>
        getNextMemberTradeItemSearchIndex(current, results.length, 1),
      )
      return
    }
    if (event.key === 'ArrowUp') {
      if (!normalizedQuery) return
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) =>
        getNextMemberTradeItemSearchIndex(current, results.length, -1),
      )
      return
    }
    if (event.key === 'Enter') {
      if (!open || activeIndex < 0 || !results[activeIndex]) return
      event.preventDefault()
      select(results[activeIndex])
      return
    }
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 focus-within:border-amber-500/70">
          <Search size={14} className="shrink-0 text-gray-500" />
          <span id={hintId} className="sr-only">
            {keyboardHintLabel}
          </span>
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(event) => search(event.target.value)}
            onFocus={() => hasRawQuery && setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            aria-autocomplete="list"
            aria-controls={normalizedQuery ? listboxId : undefined}
            aria-describedby={hintId}
            aria-expanded={open && Boolean(normalizedQuery)}
            aria-activedescendant={activeOptionId}
            aria-invalid={isInvalidQuery || undefined}
            role="combobox"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
          />
          {searching && normalizedQuery && (
            <>
              <div
                className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border border-amber-400 border-t-transparent"
                aria-hidden="true"
              />
              <span className="sr-only" role="status">
                {loadingLabel}
              </span>
            </>
          )}
        </div>

        {open && normalizedQuery && results.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(18rem,45vh)] overflow-y-auto overscroll-contain rounded-lg border border-gray-700 bg-gray-950 shadow-xl"
          >
            {results.map((item, index) => {
              const srcs = itemImageSrcs(item.uniqueName, enchant, 40)
              const active = index === activeIndex
              return (
                <button
                  key={item.uniqueName}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerEnter={() => setActiveIndex(index)}
                  onClick={() => select(item, { blurInput: true })}
                  style={{ touchAction: 'manipulation' }}
                  className={`flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                    active ? 'bg-gray-800 text-white' : 'hover:bg-gray-800'
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-800 bg-gray-900">
                    <AlbionItemImage
                      src={srcs[0]}
                      fallbackSrcs={srcs.slice(1)}
                      alt=""
                      width={34}
                      height={34}
                      unoptimized
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">
                      {item.displayName}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-gray-500">
                      {item.uniqueName}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {open && isInvalidQuery && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-3 text-center text-xs text-gray-500 shadow-xl">
            {invalidQueryLabel}
          </div>
        )}

        {open && !searching && normalizedQuery && results.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 space-y-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-3 text-center text-xs text-gray-500 shadow-xl">
            <p>{noResultsLabel}</p>
            <p className="text-gray-400">{fallbackLabel}</p>
          </div>
        )}
      </div>

      {selectedItem && selectedSrcs.length > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-gray-950/70 px-2 py-1.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-800 bg-gray-950">
            <AlbionItemImage
              src={selectedSrcs[0]}
              fallbackSrcs={selectedSrcs.slice(1)}
              alt={selectedItem.displayName}
              width={34}
              height={34}
              unoptimized
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-white">
              {selectedItem.displayName}
              {enchant > 0 ? ` .${enchant}` : ''}
            </span>
            <span className="block truncate font-mono text-[10px] text-gray-500">
              {selectedItem.uniqueName}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
