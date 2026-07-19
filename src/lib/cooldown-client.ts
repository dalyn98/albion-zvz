'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Slot } from '@/types'
import type { EffectiveCooldown } from '@/lib/cooldown-types'
import {
  cooldownRequestCacheKey,
  createCooldownSlotPayload,
  type CooldownSlotPayload,
} from '@/lib/cooldown-request'

interface PendingCooldown {
  cacheKey: string
  spellId: string
  slot: CooldownSlotPayload
}

const MAX_BATCH_SIZE = 50
const MAX_RESULT_CACHE_ENTRIES = 1_000
const resultCache = new Map<string, EffectiveCooldown | null>()
const pending = new Map<string, PendingCooldown>()
const inFlight = new Set<string>()
const listeners = new Set<() => void>()
let cacheVersion = 0
let flushScheduled = false

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

function cacheResult(key: string, value: EffectiveCooldown | null): void {
  if (!resultCache.has(key) && resultCache.size >= MAX_RESULT_CACHE_ENTRIES) {
    const oldestKey = resultCache.keys().next().value
    if (typeof oldestKey === 'string') resultCache.delete(oldestKey)
  }
  resultCache.set(key, value)
}

function enqueue(entry: PendingCooldown): void {
  if (resultCache.has(entry.cacheKey) || inFlight.has(entry.cacheKey)) return
  pending.set(entry.cacheKey, entry)
  if (flushScheduled) return

  flushScheduled = true
  queueMicrotask(() => {
    flushScheduled = false
    void flushPending()
  })
}

async function flushPending(): Promise<void> {
  const entries = [...pending.values()]
  pending.clear()
  const batches: PendingCooldown[][] = []
  for (let index = 0; index < entries.length; index += MAX_BATCH_SIZE) {
    batches.push(entries.slice(index, index + MAX_BATCH_SIZE))
  }

  await Promise.all(batches.map(async (batch) => {
    const requested = batch.filter((entry) => {
      if (resultCache.has(entry.cacheKey) || inFlight.has(entry.cacheKey)) return false
      inFlight.add(entry.cacheKey)
      return true
    })
    if (requested.length === 0) return

    try {
      const response = await fetch('/api/items/cooldowns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: requested.map((entry, index) => ({
            key: String(index),
            spellId: entry.spellId,
            slot: entry.slot,
          })),
        }),
      })
      if (!response.ok) throw new Error(`Cooldown lookup failed: ${response.status}`)
      const payload = await response.json() as {
        results?: Record<string, EffectiveCooldown | null>
      }
      const results = payload.results ?? {}
      requested.forEach((entry, index) => {
        cacheResult(entry.cacheKey, results[String(index)] ?? null)
      })
      notify()
    } catch {
      // Keep the non-CD spell UI usable. A later render can retry.
    } finally {
      for (const entry of requested) inFlight.delete(entry.cacheKey)
    }
  }))
}

export function useEffectiveCooldown(
  slot: Slot,
  spellId: string | null,
): EffectiveCooldown | null {
  useSyncExternalStore(subscribe, getCacheVersion, getServerCacheVersion)
  const request = useMemo<PendingCooldown | null>(() => {
    if (!spellId) return null
    return {
      cacheKey: cooldownRequestCacheKey(slot, spellId),
      spellId,
      slot: createCooldownSlotPayload(slot),
    }
  }, [slot, spellId])

  useEffect(() => {
    if (request) enqueue(request)
  }, [request])

  return request ? resultCache.get(request.cacheKey) ?? null : null
}
