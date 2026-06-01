'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ArrowRight, GripHorizontal, RotateCcw } from 'lucide-react'
import { moveFilterValue, orderedFilterValues, type FilterOrderDirection } from '@/lib/filter-order'

export interface ReorderableFilterChipItem {
  value: string
  label: string
  href: string
  count?: number
}

interface Props {
  storageKey: string
  items: readonly ReorderableFilterChipItem[]
  activeValue: string
  activeClassName: string
  inactiveClassName?: string
  chipClassName?: string
  countActiveClassName?: string
  countInactiveClassName?: string
  navClassName?: string
  listClassName?: string
  ariaLabel?: string
}

function readStoredOrder(storageKey: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return null
  }
}

function writeStoredOrder(storageKey: string, order: readonly string[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order))
  } catch {
    // Preference storage is best-effort; filter navigation must still work.
  }
}

function removeStoredOrder(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // Preference storage is best-effort; filter navigation must still work.
  }
}

export default function ReorderableFilterChips({
  storageKey,
  items,
  activeValue,
  activeClassName,
  inactiveClassName = 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white',
  chipClassName = 'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap',
  countActiveClassName,
  countInactiveClassName = 'bg-gray-800 text-gray-300',
  navClassName = 'flex items-center gap-2 flex-wrap',
  listClassName = 'flex items-center gap-2 flex-wrap',
  ariaLabel,
}: Props) {
  const t = useTranslations('common')
  const [isEditing, setIsEditing] = useState(false)
  const defaultOrder = useMemo(() => items.map((item) => item.value), [items])
  const [order, setOrder] = useState<string[]>(defaultOrder)

  useEffect(() => {
    // localStorage is browser-only; hydrate after mount so SSR markup stays stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(orderedFilterValues(defaultOrder, readStoredOrder(storageKey)))
  }, [defaultOrder, storageKey])

  const orderedItems = useMemo(() => {
    const itemsByValue = new Map(items.map((item) => [item.value, item]))
    return orderedFilterValues(defaultOrder, order)
      .map((value) => itemsByValue.get(value))
      .filter((item): item is ReorderableFilterChipItem => !!item)
  }, [defaultOrder, items, order])

  const persistOrder = (nextOrder: string[]) => {
    setOrder(nextOrder)
    writeStoredOrder(storageKey, nextOrder)
  }

  const moveItem = (value: string, direction: FilterOrderDirection) => {
    persistOrder(moveFilterValue(orderedItems.map((item) => item.value), value, direction))
  }

  const resetOrder = () => {
    setOrder(defaultOrder)
    removeStoredOrder(storageKey)
  }

  return (
    <nav aria-label={ariaLabel} className={navClassName}>
      <div className={listClassName}>
        {orderedItems.map((item, index) => {
          const isActive = activeValue === item.value
          const isFirst = index === 0
          const isLast = index === orderedItems.length - 1
          const countClassName = isActive
            ? countActiveClassName ?? countInactiveClassName
            : countInactiveClassName

          return (
            <span
              key={item.value}
              className={`inline-flex items-center gap-1 ${isEditing ? 'rounded-full bg-gray-950/50 p-0.5' : ''}`}
            >
              {isEditing && (
                <button
                  type="button"
                  onClick={() => moveItem(item.value, 'earlier')}
                  disabled={isFirst}
                  title={t('filterOrderMoveEarlier', { label: item.label })}
                  aria-label={t('filterOrderMoveEarlier', { label: item.label })}
                  className="inline-flex size-6 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ArrowLeft size={12} />
                </button>
              )}
              <Link
                href={item.href}
                className={`${chipClassName} ${isActive ? activeClassName : inactiveClassName}`}
              >
                <span>{item.label}</span>
                {typeof item.count === 'number' && (
                  <span className={`text-[10px] font-semibold rounded px-1.5 py-px ${countClassName}`}>
                    {item.count}
                  </span>
                )}
              </Link>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => moveItem(item.value, 'later')}
                  disabled={isLast}
                  title={t('filterOrderMoveLater', { label: item.label })}
                  aria-label={t('filterOrderMoveLater', { label: item.label })}
                  className="inline-flex size-6 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ArrowRight size={12} />
                </button>
              )}
            </span>
          )
        })}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setIsEditing((current) => !current)}
          aria-pressed={isEditing}
          title={isEditing ? t('filterOrderDone') : t('filterOrderEdit')}
          aria-label={isEditing ? t('filterOrderDone') : t('filterOrderEdit')}
          className={`inline-flex size-8 items-center justify-center rounded-full border transition-colors ${
            isEditing
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
              : 'border-gray-700 bg-gray-900 text-gray-400 hover:text-white'
          }`}
        >
          <GripHorizontal size={14} />
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={resetOrder}
            title={t('filterOrderReset')}
            aria-label={t('filterOrderReset')}
            className="inline-flex size-8 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-400 transition-colors hover:text-white"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </div>
    </nav>
  )
}
