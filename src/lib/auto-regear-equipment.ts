// auto-regear.ts 의 killboard equipment 파싱 / 슬롯 매핑 헬퍼. processAutoRegear
// 함수의 본체와 분리해 단위 테스트와 다른 진입점(예: 트래킹 사망 직접 신청 flow)
// 에서도 재사용한다. 본 모듈은 외부 IO 없는 순수 함수만 포함.

import type { AodpPriceKey } from '@/lib/shop/aodp'
import { SLOT_KEYS, type BuildSnapshot, type SlotKey } from '@/types'

// 알비온 killboard equipment 슬롯명 → BuildSnapshot 슬롯 키 매핑.
// MainHand/OffHand 가 weapon/offhand 로 변환되며, Bag 은 BuildSnapshot 에 슬롯이
// 없어 무시. 빈 항목은 { name: null, id: null } 로 초기화 후 데이터 발견 시 덮어씀.
export const KILLBOARD_TO_SNAPSHOT_SLOT: Partial<Record<string, SlotKey>> = {
  MainHand: 'weapon',
  OffHand: 'offhand',
  Head: 'head',
  Armor: 'armor',
  Shoes: 'shoes',
  Cape: 'cape',
  Mount: 'mount',
  Potion: 'potion',
  Food: 'food',
}

// Albion 킬보드 Equipment JSONB 는 이 키들 중 일부를 갖는다. 빈/null 값은 장비
// 없음(예: 물약을 안 먹고 죽음) 이므로 정상 케이스.
export const EQUIPMENT_SLOTS = [
  'MainHand',
  'OffHand',
  'Head',
  'Armor',
  'Shoes',
  'Bag',
  'Cape',
  'Mount',
  'Potion',
  'Food',
] as const

export interface EquipmentItem {
  Type?: string
  Count?: number
  Quality?: number
}

// killboard equipment JSONB → BuildSnapshot. id 에 enchant 접미사(@N) 포함된
// Albion Type 문자열을 그대로 박는다.
// Quality 는 craft 모드와 무관(품질 X) 이라 BuildSnapshot 에 보존하지 않는다.
//
// 트래킹 사망 직접 신청(이벤트 외) flow 에서도 같은 변환을 쓰므로 export.
export function equipmentToBuildSnapshot(
  equipment: Record<string, EquipmentItem | null> | null,
  roleName: string | null,
): BuildSnapshot {
  const snapshot = SLOT_KEYS.reduce(
    (acc, k) => {
      acc[k] = { name: null, id: null }
      return acc
    },
    {} as Record<SlotKey, { name: string | null; id: string | null }>,
  )
  if (equipment) {
    for (const [killboardSlot, raw] of Object.entries(equipment)) {
      const target = KILLBOARD_TO_SNAPSHOT_SLOT[killboardSlot]
      if (!target) continue
      if (!raw || typeof raw !== 'object' || typeof raw.Type !== 'string') continue
      const trimmed = raw.Type.trim()
      if (!trimmed) continue
      snapshot[target] = { name: null, id: trimmed }
    }
  }
  return { role_name: roleName, ...snapshot }
}

// Type 문자열은 `T5_ARMOR_CLOTH_SET2@1` 같은 포맷. @N 접미는 있을 수도 없을 수도.
export function parseItemType(type: string): { uniqueName: string; enchant: number } | null {
  const trimmed = type.trim()
  if (!trimmed) return null
  const at = trimmed.indexOf('@')
  if (at === -1) return { uniqueName: trimmed, enchant: 0 }
  const base = trimmed.slice(0, at)
  const suffix = trimmed.slice(at + 1)
  const enchant = Number(suffix)
  if (!Number.isFinite(enchant) || enchant < 0) return { uniqueName: base, enchant: 0 }
  return { uniqueName: base, enchant: Math.trunc(enchant) }
}

// 장비 JSONB 에서 AODP 조회에 필요한 키 목록을 뽑는다. 동일 item 이 여러 슬롯에
// 걸칠 수 있지만 AODP 는 키 기준으로 결과를 반환하므로 uniq 처리는 fetchAodpPrices
// 내부에 맡기고 여기선 슬롯 단위로 중복 포함.
//
// excludedSnapshotSlots: 길드 설정 auto_regear_excluded_slots 에서 파싱한 SlotKey
// 집합. 매칭되는 killboard 슬롯은 시세 합산/breakdown 에서 제외된다 (Bag 은 매핑
// 없어 자동 제외).
export function extractGearKeys(
  equipment: Record<string, EquipmentItem | null> | null,
  excludedSnapshotSlots: ReadonlySet<SlotKey>,
): Array<{ slot: string; key: AodpPriceKey; count: number }> {
  if (!equipment) return []
  const out: Array<{ slot: string; key: AodpPriceKey; count: number }> = []
  for (const slot of EQUIPMENT_SLOTS) {
    const snapshotSlot = KILLBOARD_TO_SNAPSHOT_SLOT[slot]
    if (snapshotSlot && excludedSnapshotSlots.has(snapshotSlot)) continue
    const raw = equipment[slot]
    if (!raw || typeof raw !== 'object' || typeof raw.Type !== 'string') continue
    const parsed = parseItemType(raw.Type)
    if (!parsed) continue
    const count = Number.isFinite(raw.Count) && raw.Count! > 0 ? Math.trunc(raw.Count!) : 1
    const quality = Number.isFinite(raw.Quality) && raw.Quality! >= 1 ? Math.trunc(raw.Quality!) : 1
    out.push({
      slot,
      key: { uniqueName: parsed.uniqueName, enchant: parsed.enchant, quality },
      count,
    })
  }
  return out
}
