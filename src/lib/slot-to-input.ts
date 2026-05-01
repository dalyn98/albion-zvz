import type { GearOption, GearSpec, Slot, SlotKey } from '@/types'
import { SLOT_KEYS } from '@/types'
import type { SlotInput } from '@/components/SlotEditor'

// DB Slot row → editor SlotInput. 빌드 필드만 다룬다 — 슬롯 할당(assigned_*),
// 콜러 요청(requested_*), 파티 메타는 단일 슬롯 편집의 책임 바깥이라 복사하지
// 않고, 편집기가 신경쓰는 아이템/옵션/주문/스펙/메모/역할만 전개한다.
export function slotToInput(s: Slot): SlotInput {
  return {
    id: s.id,
    slot_number: s.slot_number,
    is_hidden: s.is_hidden,
    role_name: s.role_name ?? '',
    notes: s.notes ?? '',
    auto_regear_excluded: s.auto_regear_excluded,
    manual_regear_excluded: s.manual_regear_excluded,
    is_solo_bomb: s.is_solo_bomb,
    assigned_username: s.assigned_username,
    items: SLOT_KEYS.reduce((acc, k) => ({
      ...acc,
      [k]: {
        name: s[`${k}_name`] ?? '',
        id: s[`${k}_id`] ?? '',
      },
    }), {} as Record<SlotKey, { name: string; id: string }>),
    options: SLOT_KEYS.reduce((acc, k) => ({
      ...acc,
      [k]: s[`${k}_options`] ?? [],
    }), {} as Record<SlotKey, GearOption[]>),
    spells: SLOT_KEYS.reduce((acc, k) => ({
      ...acc,
      [k]: s.spells?.[k] ?? [],
    }), {} as Record<SlotKey, string[]>),
    specs: SLOT_KEYS.reduce((acc, k) => ({
      ...acc,
      [k]: s.gear_specs?.[k] ?? {},
    }), {} as Record<SlotKey, GearSpec>),
  }
}
