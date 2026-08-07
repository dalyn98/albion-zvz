'use client'

import { Bell, Star } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'

const FAVORITES_KEY = 'agm-public-zvz-favorites-v1'
const VISIT_KEY_PREFIX = 'agm-public-zvz-last-visit-v1'

export interface PublicZvzFavoriteEntity {
  server: 'west' | 'europe' | 'east'
  entityKind: 'guild' | 'alliance'
  entityId: string
  entityName: string
  href: string
}

function readFavorites(): PublicZvzFavoriteEntity[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is PublicZvzFavoriteEntity => (
      entry &&
      typeof entry === 'object' &&
      ['west', 'europe', 'east'].includes(entry.server) &&
      ['guild', 'alliance'].includes(entry.entityKind) &&
      typeof entry.entityId === 'string' &&
      typeof entry.entityName === 'string' &&
      typeof entry.href === 'string'
    )).slice(0, 20)
  } catch {
    return []
  }
}

function favoriteKey(entity: PublicZvzFavoriteEntity): string {
  return `${entity.server}:${entity.entityKind}:${entity.entityId}`
}

const EMPTY_FAVORITES: PublicZvzFavoriteEntity[] = []
const favoriteSubscribers = new Set<() => void>()
let cachedFavorites: PublicZvzFavoriteEntity[] | null = null
let favoriteStorageListenerActive = false

function getFavoritesSnapshot(): PublicZvzFavoriteEntity[] {
  cachedFavorites ??= readFavorites()
  return cachedFavorites
}

function emitFavoritesChange(next?: PublicZvzFavoriteEntity[]) {
  cachedFavorites = next ?? readFavorites()
  favoriteSubscribers.forEach((subscriber) => subscriber())
}

function handleFavoritesStorage(event: StorageEvent) {
  if (event.key === FAVORITES_KEY) emitFavoritesChange()
}

function subscribeFavorites(subscriber: () => void): () => void {
  favoriteSubscribers.add(subscriber)
  if (!favoriteStorageListenerActive) {
    window.addEventListener('storage', handleFavoritesStorage)
    favoriteStorageListenerActive = true
  }
  return () => {
    favoriteSubscribers.delete(subscriber)
    if (favoriteSubscribers.size === 0 && favoriteStorageListenerActive) {
      window.removeEventListener('storage', handleFavoritesStorage)
      favoriteStorageListenerActive = false
      cachedFavorites = null
    }
  }
}

function writeFavorites(next: PublicZvzFavoriteEntity[]) {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
  } catch {
    // Keep the interaction available for this tab when browser storage is blocked.
  }
  emitFavoritesChange(next)
}

function usePublicZvzFavorites(): PublicZvzFavoriteEntity[] {
  return useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, () => EMPTY_FAVORITES)
}

export function PublicZvzFavoriteButton({
  entity,
  addLabel,
  removeLabel,
  compact = false,
}: {
  entity: PublicZvzFavoriteEntity
  addLabel: string
  removeLabel: string
  compact?: boolean
}) {
  const favorites = usePublicZvzFavorites()
  const key = favoriteKey(entity)
  const favorite = favorites.some((row) => favoriteKey(row) === key)

  const toggle = () => {
    const next = favorite
      ? favorites.filter((row) => favoriteKey(row) !== key)
      : [entity, ...favorites].slice(0, 20)
    writeFavorites(next)
  }

  const label = favorite ? removeLabel : addLabel
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={favorite}
      aria-label={label}
      title={label}
      className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
        favorite
          ? 'bg-amber-300/15 text-amber-200 shadow-[0_0_0_1px_rgba(252,211,77,0.24)]'
          : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.09] hover:text-white'
      } ${compact ? 'min-w-10 px-2' : 'px-3 text-xs font-bold'}`}
    >
      <Star size={15} aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} />
      {compact ? <span className="sr-only">{label}</span> : label}
    </button>
  )
}

export function PublicZvzFavoritesBar({
  server,
  title,
  emptyLabel,
  guildLabel,
  allianceLabel,
}: {
  server: PublicZvzFavoriteEntity['server']
  title: string
  emptyLabel: string
  guildLabel: string
  allianceLabel: string
}) {
  const favorites = usePublicZvzFavorites()
  const visible = favorites.filter((favorite) => favorite.server === server).slice(0, 8)
  if (favorites.length === 0) return null

  return (
    <aside className="mt-5 flex flex-col gap-2 border-y border-white/[0.08] py-3 sm:flex-row sm:items-center">
      <p className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-amber-200">
        <Star size={14} fill="currentColor" aria-hidden="true" />
        {title}
      </p>
      {visible.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {visible.map((favorite) => (
            <Link
              key={favoriteKey(favorite)}
              href={favorite.href}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-white/[0.045] px-2.5 text-xs font-semibold text-gray-200 transition-[background-color,color,scale] duration-150 ease-out hover:bg-amber-300/10 hover:text-amber-100 active:scale-[0.96]"
            >
              <span className="text-[10px] text-gray-500">
                {favorite.entityKind === 'guild' ? guildLabel : allianceLabel}
              </span>
              {favorite.entityName}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-600">{emptyLabel}</p>
      )}
    </aside>
  )
}

export function PublicZvzNewBattleNotice({
  server,
  battleStartedAt,
  label,
}: {
  server: PublicZvzFavoriteEntity['server']
  battleStartedAt: string[]
  label: string
}) {
  const [newCount, setNewCount] = useState(0)

  useEffect(() => {
    if (battleStartedAt.length === 0) return
    const storageKey = `${VISIT_KEY_PREFIX}:${server}`
    try {
      const previous = window.localStorage.getItem(storageKey)
      const previousTime = previous ? Date.parse(previous) : Number.NaN
      const latest = battleStartedAt.reduce<string | null>((current, value) => (
        !current || Date.parse(value) > Date.parse(current) ? value : current
      ), null)
      if (Number.isFinite(previousTime)) {
        setNewCount(battleStartedAt.filter((value) => Date.parse(value) > previousTime).length)
      }
      if (latest) window.localStorage.setItem(storageKey, latest)
    } catch {
      // The notice is optional when browser storage is unavailable.
    }
  }, [battleStartedAt, server])

  if (newCount === 0) return null
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-sky-300/10 px-2.5 text-xs font-bold tabular-nums text-sky-200 shadow-[0_0_0_1px_rgba(125,211,252,0.2)]">
      <Bell size={13} aria-hidden="true" />
      {label.replace('{count}', String(newCount))}
    </span>
  )
}
