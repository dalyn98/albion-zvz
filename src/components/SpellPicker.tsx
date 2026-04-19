'use client'

import { useEffect, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import SpellImage from './SpellImage'
import { MAX_SPELLS_PER_SLOT_ITEM } from '@/types'

interface Props {
  // One or more item uniqueNames that own this picker. For single-weapon /
  // single armor slots this is `[id]`; for multi-weapon slots, pass every
  // option's id. An empty array disables the picker (no item chosen yet).
  itemIds: string[]
  spells: string[]
  onAdd: (uniqueName: string) => void
  onRemove: (uniqueName: string) => void
  maxSpells?: number
}

function mergePools(pools: string[][]): string[] {
  // Preserves the order the server returned — items.xml lists spells in
  // slot order (Q→W→E→Passives), and we want the grid to honor that.
  const seen = new Set<string>()
  const out: string[] = []
  for (const pool of pools) {
    for (const spell of pool) {
      if (seen.has(spell)) continue
      seen.add(spell)
      out.push(spell)
    }
  }
  return out
}

// Module-level cache keyed by item uniqueName. The pool never changes at
// runtime (data is bundled at build time), so re-fetching per SlotEditor
// open would just add latency for repeat item picks.
const poolCache = new Map<string, string[]>()

async function loadMissing(ids: string[]): Promise<void> {
  const missing = ids.filter((id) => !poolCache.has(id))
  if (missing.length === 0) return
  const params = new URLSearchParams()
  for (const id of missing) params.append('id', id)
  const res = await fetch(`/api/items/spells?${params.toString()}`)
  if (!res.ok) throw new Error(`Failed to fetch spell pool: ${res.status}`)
  const data = (await res.json()) as Record<string, string[]>
  for (const id of missing) {
    poolCache.set(id, Array.isArray(data[id]) ? data[id] : [])
  }
}

export default function SpellPicker({
  itemIds,
  spells,
  onAdd,
  onRemove,
  maxSpells = MAX_SPELLS_PER_SLOT_ITEM,
}: Props) {
  // Tick forces a re-read from poolCache after an async fetch completes.
  // Using a counter rather than state-of-pool avoids sync setState in the
  // effect body (lint rule `react-hooks/set-state-in-effect`).
  const [tick, setTick] = useState(0)
  const [error, setError] = useState('')
  const key = itemIds.join(',')

  useEffect(() => {
    if (itemIds.length === 0) return
    let cancelled = false
    loadMissing(itemIds)
      .then(() => {
        if (cancelled) return
        setError('')
        setTick((t) => t + 1)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '스킬 목록 로드 실패')
      })
    return () => {
      cancelled = true
    }
    // itemIds is captured via `key` — same contents produce the same key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Derive everything from props + poolCache so no synchronous setState
  // needs to fire in the effect body.
  void tick // tick is intentionally read to re-subscribe after cache updates
  const pool = mergePools(itemIds.map((id) => poolCache.get(id) ?? []))
  const hasItems = itemIds.length > 0
  const anyUnfetched = itemIds.some((id) => !poolCache.has(id))
  const isLoading = hasItems && anyUnfetched

  const canAddMore = spells.length < maxSpells

  const toggle = (spellId: string) => {
    if (spells.includes(spellId)) {
      onRemove(spellId)
      return
    }
    if (!canAddMore) return
    onAdd(spellId)
  }

  // Prune-but-preserve: if the admin swaps items and a previously-picked
  // spell is no longer in the new pool, surface it as a "stale" chip rather
  // than silently deleting — the choice they made was intentional.
  const stale = hasItems && !isLoading
    ? spells.filter((s) => !pool.includes(s))
    : []

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[10px] text-purple-300 font-semibold">
          <Sparkles size={10} />
          스킬 {spells.length}/{maxSpells}
        </span>
        {isLoading && <span className="text-[10px] text-gray-500">로드 중...</span>}
      </div>

      {!hasItems ? (
        <p className="text-[10px] text-gray-600 italic">아이템을 먼저 선택하세요.</p>
      ) : error ? (
        <p className="text-[10px] text-red-400">{error}</p>
      ) : !isLoading && pool.length === 0 ? (
        <p className="text-[10px] text-gray-600 italic">이 아이템은 스킬 선택이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {pool.map((spellId) => {
            const selected = spells.includes(spellId)
            const disabled = !selected && !canAddMore
            return (
              <button
                key={spellId}
                type="button"
                onClick={() => toggle(spellId)}
                disabled={disabled}
                title={spellId}
                className={`relative rounded-md transition-all ${
                  selected
                    ? 'ring-2 ring-purple-400 scale-100'
                    : disabled
                      ? 'opacity-30 cursor-not-allowed'
                      : 'opacity-60 hover:opacity-100 hover:ring-1 hover:ring-purple-500/50'
                }`}
                aria-pressed={selected}
              >
                <SpellImage spellId={spellId} size={24} />
              </button>
            )
          })}
        </div>
      )}

      {stale.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          <span className="text-[10px] text-amber-300/80 self-center">이전 선택(현재 풀에 없음):</span>
          {stale.map((spellId) => (
            <div key={spellId} className="relative">
              <SpellImage spellId={spellId} size={22} />
              <button
                type="button"
                onClick={() => onRemove(spellId)}
                className="absolute -top-1 -right-1 bg-red-500 hover:bg-red-400 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center"
                aria-label={`${spellId} 제거`}
              >
                <X size={8} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
