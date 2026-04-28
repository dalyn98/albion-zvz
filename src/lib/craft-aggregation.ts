// Aggregates active craft tasks into "what equipment does the guild need to
// produce in total?" answers. 정련 재료 트래킹이 폐기된 후 (마이그 112), 이
// 모듈은 itemId 단위 합산만 책임지고, 재료 BoM 은 호출자가 필요할 때만
// lookupRecipe 로 직접 조회한다.

import { lookupRecipe } from '@/lib/craft-recipes'
import { SLOT_KEYS, type BuildSnapshot, type SlotKey } from '@/types'

export interface CraftItemAggregateRow {
  itemId: string
  itemName: string | null
  count: number
  hasRecipe: boolean
  isArtifact: boolean
  // Slots this item appeared in across all snapshots — useful so the UI can
  // hint "weapon × 3, offhand × 2" without recomputing.
  slots: SlotKey[]
}

export interface CraftMaterialAggregateRow {
  uniqueName: string
  // Gross count summed across every (item × quantity) recipe. Pre-return-rate.
  count: number
  // Tier extracted from the material id (T4_PLANKS → 4). 0 when no tier.
  // Lets the UI group materials by tier without re-parsing on render.
  tier: number
}

export interface CraftAggregateBreakdown {
  // Total number of tasks (snapshots) included.
  taskCount: number
  // Items the guild must produce, sorted by count desc.
  items: CraftItemAggregateRow[]
  // Materials needed gross (sum of recipe × item count). Sorted by tier desc
  // then unique name asc so T8 materials are at the top.
  materials: CraftMaterialAggregateRow[]
  // Items present in snapshots but not in our recipe bundle (free-text,
  // mounts, food/potions). Reported as a count for the UI to render a hint.
  unknownItemCount: number
  // Items flagged isArtifact — included in the material list (T?_ARTEFACT_*
  // appears as a regular line). Count is shown so the UI can flag the
  // workbench requirement.
  artifactCount: number
}

interface AggregateOptions {
  // Skip slots that don't represent craftable equipment. Mounts/food/potions
  // contribute nothing useful to a crafting bill of materials.
  excludeSlots?: readonly SlotKey[]
}

const DEFAULT_EXCLUDED_SLOTS: readonly SlotKey[] = ['mount', 'food', 'potion']

export function aggregateBuildSnapshots(
  snapshots: readonly (BuildSnapshot | null)[],
  options: AggregateOptions = {},
): CraftAggregateBreakdown {
  const excluded = new Set<SlotKey>(options.excludeSlots ?? DEFAULT_EXCLUDED_SLOTS)
  // itemId → aggregate state
  const itemMap = new Map<
    string,
    { count: number; slots: Set<SlotKey>; itemName: string | null }
  >()

  for (const snap of snapshots) {
    if (!snap) continue
    for (const slot of SLOT_KEYS) {
      if (excluded.has(slot)) continue
      const item = snap[slot]
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

  const items: CraftItemAggregateRow[] = []
  const materialMap = new Map<string, number>()
  let unknownItemCount = 0
  let artifactCount = 0

  for (const [itemId, info] of itemMap) {
    const recipe = lookupRecipe(itemId)
    const isArtifact = recipe?.isArtifact ?? false
    items.push({
      itemId,
      itemName: info.itemName,
      count: info.count,
      hasRecipe: recipe != null,
      isArtifact,
      slots: Array.from(info.slots),
    })
    if (!recipe) {
      unknownItemCount += info.count
      continue
    }
    if (isArtifact) {
      artifactCount += info.count
    }
    // 유물도 일반 craftable 처럼 재료 라인으로 합산 — T?_ARTEFACT_* 가 박스에
    // 같이 들어가 한 번에 픽업 / 청부제작에 활용된다.
    for (const m of recipe.materials) {
      materialMap.set(m.id, (materialMap.get(m.id) ?? 0) + m.count * info.count)
    }
  }

  items.sort((a, b) => b.count - a.count || a.itemId.localeCompare(b.itemId))

  const materials: CraftMaterialAggregateRow[] = Array.from(materialMap.entries())
    .map(([uniqueName, count]) => ({
      uniqueName,
      count,
      tier: tierFromMaterialId(uniqueName),
    }))
    .sort((a, b) => b.tier - a.tier || a.uniqueName.localeCompare(b.uniqueName))

  return {
    taskCount: snapshots.length,
    items,
    materials,
    unknownItemCount,
    artifactCount,
  }
}

function tierFromMaterialId(id: string): number {
  const m = /^T(\d)/.exec(id)
  return m ? Number(m[1]) : 0
}
