'use client'

import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Loader2, Sparkles, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { TentativeSlotRecommendationOption } from '@/lib/event-tentative-signups'
import { formatTentativeSlotRecommendationLabel } from '@/lib/event-tentative-recommendation'
import { useItemNameResolver } from '@/lib/item-names-client'
import { stripTierPrefix } from '@/lib/weapon-display'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import type { Locale } from '@/i18n/locales'
import { getRoleStyle } from '@/types'
import ItemImage from './ItemImage'
import { useBodyScrollLock } from './useBodyScrollLock'
import { resolveTentativeSlotPickerPosition } from '@/lib/tentative-slot-picker-position'

interface Props {
  value: string | null
  options: TentativeSlotRecommendationOption[]
  memberName: string
  disabled: boolean
  onChange: (slotId: string) => void
}

interface PickerPosition extends CSSProperties {
  '--picker-left': string
  '--picker-top': string
}

const PANEL_WIDTH = 352
const VIEWPORT_GAP = 16
const TRIGGER_GAP = 8

export default function TentativeSlotRecommendationPicker({
  value,
  options,
  memberName,
  disabled,
  onChange,
}: Props) {
  const t = useTranslations('eventTentative')
  const tRole = useTranslations('slotRole')
  const locale = useLocale() as Locale
  const { getLocalizedItemName } = useItemNameResolver(locale)
  const dialogId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const initialFocusIndexRef = useRef(-1)
  const [open, setOpen] = useState(false)
  const [isMobileSheet, setIsMobileSheet] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState<PickerPosition>({
    '--picker-left': `${VIEWPORT_GAP}px`,
    '--picker-top': `${VIEWPORT_GAP}px`,
  })
  useBodyScrollLock(open && isMobileSheet)

  const { groups, optionById, optionIndexById } = useMemo(() => {
    const grouped = new Map<number, TentativeSlotRecommendationOption[]>()
    const byId = new Map<string, TentativeSlotRecommendationOption>()
    const indexById = new Map<string, number>()
    for (const [index, option] of options.entries()) {
      const partyOptions = grouped.get(option.partyNumber) ?? []
      partyOptions.push(option)
      grouped.set(option.partyNumber, partyOptions)
      byId.set(option.id, option)
      indexById.set(option.id, index)
    }
    return {
      groups: [...grouped.entries()].sort(([left], [right]) => left - right),
      optionById: byId,
      optionIndexById: indexById,
    }
  }, [options])
  const selected = value ? optionById.get(value) ?? null : null
  const unavailable = options.length === 0 && !selected

  const labelFor = (slot: TentativeSlotRecommendationOption): string => {
    const weaponName = stripTierPrefix(
      getLocalizedItemName(slot.weaponId, locale, slot.weaponName),
    ) || translateSlotRole(slot.roleName, tRole)
    return formatTentativeSlotRecommendationLabel(slot, weaponName)
  }

  const placePanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const panelHeight = panelRef.current?.getBoundingClientRect().height
      ?? Math.min(416, 112 + options.length * 64)
    const { left, top } = resolveTentativeSlotPickerPosition({
      trigger: rect,
      panelWidth: PANEL_WIDTH,
      panelHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      viewportGap: VIEWPORT_GAP,
      triggerGap: TRIGGER_GAP,
    })
    setPosition({
      '--picker-left': `${left}px`,
      '--picker-top': `${top}px`,
    })
  }, [options.length])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)')
    const sync = () => setIsMobileSheet(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const close = (restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const openPicker = (preferredIndex?: number) => {
    if (disabled || unavailable) return
    placePanel()
    const selectedIndex = value ? optionIndexById.get(value) ?? -1 : -1
    const nextIndex = preferredIndex
      ?? (selectedIndex >= 0 ? selectedIndex : options.length > 0 ? 0 : -1)
    initialFocusIndexRef.current = nextIndex
    setActiveIndex(nextIndex)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const focusFrame = requestAnimationFrame(() => {
      const initialIndex = initialFocusIndexRef.current
      if (initialIndex >= 0) optionRefs.current[initialIndex]?.focus()
      else panelRef.current?.focus()
    })
    return () => cancelAnimationFrame(focusFrame)
  }, [open])

  useLayoutEffect(() => {
    if (!open || isMobileSheet) return
    placePanel()
  }, [isMobileSheet, open, placePanel])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const handleViewportChange = () => placePanel()
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, placePanel])

  const moveFocus = (nextIndex: number) => {
    if (options.length === 0) return
    const normalized = (nextIndex + options.length) % options.length
    setActiveIndex(normalized)
    optionRefs.current[normalized]?.focus()
  }

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(activeIndex + 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(activeIndex - 1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      moveFocus(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      moveFocus(options.length - 1)
    }
  }

  const choose = (slotId: string) => {
    close()
    if (slotId !== (value ?? '')) onChange(slotId)
  }

  const panel = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[210] bg-black/55 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div
            ref={panelRef}
            id={dialogId}
            role="dialog"
            aria-modal={isMobileSheet ? true : undefined}
            aria-label={t('recommendationSelectLabel', { name: memberName })}
            tabIndex={-1}
            onKeyDown={handlePanelKeyDown}
            style={position}
            className="fixed inset-x-3 bottom-3 flex max-h-[min(80dvh,36rem)] flex-col overflow-hidden rounded-2xl bg-gray-950 shadow-[0_0_0_1px_rgba(255,255,255,0.10),0_18px_50px_rgba(0,0,0,0.55)] outline-none sm:inset-x-auto sm:bottom-auto sm:left-[var(--picker-left)] sm:top-[var(--picker-top)] sm:max-h-[min(26rem,calc(100dvh-2rem))] sm:w-[22rem] sm:rounded-xl"
          >
            <header className="flex items-center gap-3 border-b border-gray-800 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.18)]">
                <Sparkles size={17} aria-hidden="true" />
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                {t('recommendationSelectLabel', { name: memberName })}
              </p>
              <button
                type="button"
                onClick={() => close()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-gray-800 hover:text-white active:scale-[0.96]"
                aria-label={t('cancelButton')}
              >
                <X size={17} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {options.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500 text-pretty">
                  {t('recommendationNoMatchingSlots')}
                </p>
              ) : (
                <div role="listbox" className="space-y-2">
                  {groups.map(([partyNumber, partyOptions]) => {
                    const groupLabelId = `${dialogId}-party-${partyNumber}`
                    return (
                      <section key={partyNumber} role="group" aria-labelledby={groupLabelId}>
                        <p
                          id={groupLabelId}
                          className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500"
                        >
                          {t('recommendationParty', { number: partyNumber })}
                        </p>
                        <div className="space-y-1">
                          {partyOptions.map((slot) => {
                            const optionIndex = optionIndexById.get(slot.id) ?? -1
                            const isSelected = slot.id === value
                            const roleStyle = getRoleStyle(slot.roleName)
                            return (
                              <button
                                key={slot.id}
                                ref={(node) => { optionRefs.current[optionIndex] = node }}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onPointerMove={() => setActiveIndex(optionIndex)}
                                onClick={() => choose(slot.id)}
                                className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-[background-color,box-shadow,scale] duration-150 active:scale-[0.96] ${
                                  activeIndex === optionIndex
                                    ? 'bg-violet-500/12 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.45)]'
                                    : 'hover:bg-gray-900'
                                }`}
                              >
                                <ItemImage
                                  itemId={slot.weaponId}
                                  itemName={slot.weaponName}
                                  size={40}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold tabular-nums text-gray-100">
                                    {labelFor(slot)}
                                  </span>
                                  <span
                                    className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                      roleStyle?.badge ?? 'bg-gray-800 text-gray-300'
                                    }`}
                                  >
                                    {translateSlotRole(slot.roleName, tRole)}
                                  </span>
                                </span>
                                <span
                                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-[opacity,filter,scale] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] ${
                                    isSelected
                                      ? 'scale-100 bg-violet-400 text-gray-950 opacity-100 blur-0'
                                      : 'scale-[0.25] opacity-0 blur-[4px]'
                                  }`}
                                  aria-hidden="true"
                                >
                                  <Check size={15} strokeWidth={3} />
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-gray-800 p-2">
              <button
                type="button"
                onClick={() => choose('')}
                disabled={!value}
                className="flex min-h-11 w-full items-center justify-center rounded-lg px-3 text-xs font-semibold text-gray-400 transition-[background-color,color,scale] duration-150 hover:bg-gray-900 hover:text-gray-100 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35"
              >
                {t('recommendationNone')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? close(false) : openPicker()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openPicker(event.key === 'ArrowUp' ? options.length - 1 : undefined)
          }
        }}
        disabled={disabled || unavailable}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={t('recommendationSelectLabel', { name: memberName })}
        className="group flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-gray-950 pl-3 pr-2 text-left text-xs font-semibold text-gray-100 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.34),0_1px_2px_rgba(0,0,0,0.22)] transition-[background-color,box-shadow,scale] duration-150 hover:bg-gray-900 hover:shadow-[inset_0_0_0_1px_rgba(196,181,253,0.58),0_2px_5px_rgba(0,0,0,0.28)] active:scale-[0.96] disabled:pointer-events-none disabled:text-gray-500 disabled:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] sm:w-60 sm:flex-none"
      >
        <Sparkles size={14} className="shrink-0 text-violet-300" aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate tabular-nums ${selected ? 'text-gray-100' : 'text-gray-400'}`}>
          {unavailable
            ? t('recommendationNoMatchingSlots')
            : selected
              ? labelFor(selected)
              : t('recommendationNone')}
        </span>
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
          {disabled ? (
            <Loader2 size={15} className="animate-spin text-violet-300" aria-hidden="true" />
          ) : (
            <ChevronDown
              size={15}
              className={`text-gray-500 transition-transform duration-150 group-hover:text-gray-300 ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          )}
        </span>
      </button>
      {panel}
    </>
  )
}
