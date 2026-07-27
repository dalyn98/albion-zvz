'use client'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { Locale } from '@/i18n/locales'

export type ItemNameResolver = (
  uniqueName: string | null | undefined,
  locale: Locale,
  fallback: string | null | undefined,
) => string | null

interface ItemNameResolvers {
  getLocalizedItemName: ItemNameResolver
  getLocalizedItemNameWithEnchant: ItemNameResolver
}

const MAX_IDS_PER_REQUEST = 50
const MAX_NAME_CACHE_ENTRIES = 5_000
const nameCache = new Map<string, string | null>()
const inFlight = new Set<string>()
const pendingByLocale = new Map<Locale, Set<string>>()
const listeners = new Set<() => void>()
let cacheVersion = 0
let flushScheduled = false

function cacheKey(locale: Locale, itemId: string): string {
  return `${locale}:${itemId}`
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getCacheVersion(): number {
  return cacheVersion
}

function getServerCacheVersion(): number {
  return 0
}

function notify(): void {
  cacheVersion += 1
  for (const listener of listeners) listener()
}

function cacheName(key: string, value: string | null): void {
  if (!nameCache.has(key) && nameCache.size >= MAX_NAME_CACHE_ENTRIES) {
    const oldestKey = nameCache.keys().next().value
    if (typeof oldestKey === 'string') nameCache.delete(oldestKey)
  }
  nameCache.set(key, value)
}

function enqueue(locale: Locale, ids: readonly string[]): void {
  let pending = pendingByLocale.get(locale)
  if (!pending) {
    pending = new Set<string>()
    pendingByLocale.set(locale, pending)
  }

  for (const id of ids) {
    const key = cacheKey(locale, id)
    if (!nameCache.has(key) && !inFlight.has(key)) pending.add(id)
  }
  if (pending.size === 0 || flushScheduled) return

  flushScheduled = true
  queueMicrotask(() => {
    flushScheduled = false
    void flushPendingRequests()
  })
}

async function flushPendingRequests(): Promise<void> {
  const batches: Array<{ locale: Locale; ids: string[] }> = []
  for (const [locale, pending] of pendingByLocale) {
    const ids = [...pending]
    pending.clear()
    for (let index = 0; index < ids.length; index += MAX_IDS_PER_REQUEST) {
      batches.push({ locale, ids: ids.slice(index, index + MAX_IDS_PER_REQUEST) })
    }
  }

  await Promise.all(batches.map(async ({ locale, ids }) => {
    const requestedIds = ids.filter((id) => {
      const key = cacheKey(locale, id)
      if (nameCache.has(key) || inFlight.has(key)) return false
      inFlight.add(key)
      return true
    })
    if (requestedIds.length === 0) return

    try {
      const params = new URLSearchParams({ locale })
      for (const id of requestedIds) params.append('id', id)
      const response = await fetch(`/api/items/names?${params.toString()}`)
      if (!response.ok) throw new Error(`Item name lookup failed: ${response.status}`)
      const payload = await response.json() as { names?: Record<string, unknown> }
      const names = payload.names ?? {}
      for (const id of requestedIds) {
        const value = names[id]
        cacheName(cacheKey(locale, id), typeof value === 'string' ? value : null)
      }
      notify()
    } catch {
      // Keep fallbacks visible. A later component render can retry the lookup.
    } finally {
      for (const id of requestedIds) inFlight.delete(cacheKey(locale, id))
    }
  }))
}

export function useItemNameResolver(locale: Locale): ItemNameResolvers {
  const requestedIdsRef = useRef(new Set<string>())
  const observedCacheVersion = useSyncExternalStore(
    subscribe,
    getCacheVersion,
    getServerCacheVersion,
  )

  useEffect(() => {
    const ids = [...requestedIdsRef.current]
    requestedIdsRef.current.clear()
    if (ids.length > 0) enqueue(locale, ids)
  })

  const getLocalizedItemName = useCallback<ItemNameResolver>((uniqueName, _requestedLocale, fallback) => {
    void observedCacheVersion
    if (!uniqueName) return fallback ?? null
    const key = cacheKey(locale, uniqueName)
    if (nameCache.has(key)) return nameCache.get(key) ?? fallback ?? null
    requestedIdsRef.current.add(uniqueName)
    return fallback ?? null
  }, [locale, observedCacheVersion])

  const getLocalizedItemNameWithEnchant = useCallback<ItemNameResolver>((uniqueName, _requestedLocale, fallback) => {
    void observedCacheVersion
    if (!uniqueName) return fallback ?? null
    const at = uniqueName.lastIndexOf('@')
    const baseId = at === -1 ? uniqueName : uniqueName.slice(0, at)
    const key = cacheKey(locale, baseId)
    let baseName: string | null
    if (nameCache.has(key)) {
      baseName = nameCache.get(key) ?? fallback ?? null
    } else {
      requestedIdsRef.current.add(baseId)
      baseName = fallback ?? null
    }
    if (!baseName || at === -1) return baseName

    const level = Number(uniqueName.slice(at + 1))
    return Number.isFinite(level) && level > 0 ? `${baseName}.${level}` : baseName
  }, [locale, observedCacheVersion])

  return { getLocalizedItemName, getLocalizedItemNameWithEnchant }
}
