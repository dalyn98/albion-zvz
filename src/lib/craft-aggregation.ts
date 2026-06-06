// Aggregates active craft tasks into "what equipment does the guild need to
// produce in total?" answers. 정련 재료 분해는 폐기됐고 (마이그 112 + 2026-05-02
// recipe 데이터 폐기), 이 모듈은 itemId 단위 합산만 책임진다 — 완제품 장비를
// 카운트해 보여주는 게 끝이다. 청부 제작 시 재료 BoM 은 사이트가 계산하지 않는다.

import { SLOT_KEYS, type BuildSnapshot, type SlotKey } from '@/types'
import {
  CRAFT_REGEAR_SLOTS_WITH_CAPE,
  type CraftRegearSlot,
} from './regear-craft-slots'

export interface CraftItemAggregateRow {
  itemId: string
  itemName: string | null
  count: number
  // Slots this item appeared in across all snapshots — useful so the UI can
  // hint "weapon × 3, offhand × 2" without recomputing.
  slots: SlotKey[]
}

export interface CraftAggregateBreakdown {
  // Total number of tasks (snapshots) included.
  taskCount: number
  // Items the guild must produce, sorted by count desc.
  items: CraftItemAggregateRow[]
}

interface AggregateOptions {
  // Skip slots that don't represent craftable equipment. Mounts/food/potions
  // contribute nothing useful to a crafting bill of materials.
  excludeSlots?: readonly SlotKey[]
}

const DEFAULT_EXCLUDED_SLOTS: readonly SlotKey[] = ['mount', 'food', 'potion']
const SLOT_ORDER = new Map<SlotKey, number>(
  SLOT_KEYS.map((slot, index) => [slot, index]),
)

function firstSlotOrder(slots: readonly SlotKey[]): number {
  return Math.min(
    ...slots.map((slot) => SLOT_ORDER.get(slot) ?? Number.MAX_SAFE_INTEGER),
  )
}

export interface CraftBuildAggregateInput {
  snapshot: BuildSnapshot | null
  includedSlots?: readonly CraftRegearSlot[]
}

export function aggregateBuildSnapshots(
  snapshots: readonly (BuildSnapshot | null)[],
  options: AggregateOptions = {},
): CraftAggregateBreakdown {
  return aggregateCraftBuilds(
    snapshots.map((snapshot) => ({ snapshot })),
    options,
  )
}

export function aggregateCraftBuilds(
  builds: readonly CraftBuildAggregateInput[],
  options: AggregateOptions = {},
): CraftAggregateBreakdown {
  const excluded = new Set<SlotKey>(options.excludeSlots ?? DEFAULT_EXCLUDED_SLOTS)
  const itemMap = new Map<
    string,
    { count: number; slots: Set<SlotKey>; itemName: string | null }
  >()

  for (const build of builds) {
    if (!build.snapshot) continue
    const slots = build.includedSlots ?? CRAFT_REGEAR_SLOTS_WITH_CAPE
    for (const slot of slots) {
      if (excluded.has(slot)) continue
      const item = build.snapshot[slot]
      if (!item || !item.id) continue
      const cur = itemMap.get(item.id)
      if (cur) {
        cur.count += 1
        cur.slots.add(slot)
      } else {
        itemMap.set(item.id, {
          count: 1,
          slots: new Set([slot]),
          itemName: item.name ?? null,
        })
      }
    }
  }

  const items: CraftItemAggregateRow[] = Array.from(itemMap.entries())
    .map(([itemId, info]) => ({
      itemId,
      itemName: info.itemName,
      count: info.count,
      slots: Array.from(info.slots).sort(
        (a, b) =>
          (SLOT_ORDER.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (SLOT_ORDER.get(b) ?? Number.MAX_SAFE_INTEGER),
      ),
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        firstSlotOrder(a.slots) - firstSlotOrder(b.slots) ||
        a.itemId.localeCompare(b.itemId),
    )

  return {
    taskCount: builds.length,
    items,
  }
}
