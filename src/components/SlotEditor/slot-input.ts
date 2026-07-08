// SlotEditor 의 입력 도메인 모델 + 순수 헬퍼.
// JSX 없는 타입/팩토리만 모아 lib 에서도 import 가능하게 분리.

import type {
  ConditionalSlotOptions,
  GearOption,
  GearSpec,
  SlotKey,
} from '@/types'
import { FREE_ITEM_NAME, SLOT_KEYS, isFreeItem } from '@/types'
export { MAX_GEAR_OPTIONS } from '@/types'

export type GearMode = 'single' | 'multi' | 'free'
export type BuildPreviewRowMode = 'gear' | 'spells'

// 한 슬롯의 편집 가능한 전체 shape.
// `items` / `options` / `spells` / `specs` 는 모두 8-keyed record — 빈 값은
// 저장 시 sanitize 되어 DB 에는 null 로 들어간다.
export interface SlotInput {
  id?: string
  slot_number: number
  is_hidden: boolean
  role_name: string
  notes: string
  items: Record<SlotKey, { name: string; id: string }>
  options: Record<SlotKey, GearOption[]>
  // Always an 8-keyed record in the editor — simpler than Partial here. Empty
  // arrays are serialized back to null at save time (see sanitizeSpells).
  spells: Record<SlotKey, string[]>
  // Target tier/enchant per slot kind. Undefined entries in the shape mean
  // "no spec" — the member is free to bring any quality. Serialized to
  // `gear_specs` jsonb at save time.
  specs: Record<SlotKey, GearSpec>
  // Migration 050: per-slot opt-out for auto-regear. Only persisted to DB
  // when the global auto_regear_enabled toggle is ON; UI also only exposes
  // the checkbox in that case.
  auto_regear_excluded: boolean
  // Migration 069: per-slot opt-out for manual regear submissions. No global
  // toggle — always editable.
  manual_regear_excluded: boolean
  // Migration 134: 솔로밤 슬롯. 파티가 밤스쿼드일 때만 토글 가능 (UI 에서만
  // 노출, 비-밤스쿼드 파티에서는 항상 false 로 유지). DB 트리거가 invariants
  // 를 강제한다.
  is_solo_bomb: boolean
  // Migration 139: 무기 픽이 다른 종류의 후보를 좁히는 룰 (선택사항).
  // shape: { armor: { "<weapon_id>": [{name,id}, ...], ... }, shoes: { ... }, ... }
  // 비어 있으면 기존 *_options 가 그대로 후보. weapon 자체는 의존성 시작점.
  conditional_options: ConditionalSlotOptions
  assigned_username: string | null
}

function emptyPerSlot<T>(fill: () => T): Record<SlotKey, T> {
  return SLOT_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: fill() }),
    {} as Record<SlotKey, T>,
  )
}

export function emptySlotInput(slotNumber: number): SlotInput {
  return {
    slot_number: slotNumber,
    is_hidden: false,
    role_name: '',
    notes: '',
    items: emptyPerSlot(() => ({ name: '', id: '' })),
    options: emptyPerSlot(() => []),
    spells: emptyPerSlot(() => []),
    specs: emptyPerSlot(() => ({}) as GearSpec),
    auto_regear_excluded: false,
    manual_regear_excluded: false,
    is_solo_bomb: false,
    conditional_options: {},
    assigned_username: null,
  }
}

export function freeSlotItem(): { name: string; id: string } {
  return { name: FREE_ITEM_NAME, id: '' }
}

export function deriveGearMode(slot: SlotInput, key: SlotKey): GearMode {
  if (slot.options[key].length > 0) return 'multi'
  if (isFreeItem(slot.items[key].name, slot.items[key].id)) return 'free'
  return 'single'
}

export function getBuildPreviewRowMode(spellIds: readonly string[]): BuildPreviewRowMode {
  return spellIds.length > 0 ? 'spells' : 'gear'
}
