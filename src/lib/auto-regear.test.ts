import { describe, expect, it } from 'vitest'
import {
  applyActualParticipantAutoRegearGate,
  equipmentToBuildSnapshot,
  type EquipmentItem,
} from './auto-regear'

// 도메인 invariant 화석화: Killboard equipment JSONB → BuildSnapshot 변환.
// - 매핑: MainHand→weapon, OffHand→offhand, Head/Armor/Shoes/Cape/Mount/Potion/Food.
// - Bag 은 BuildSnapshot 슬롯 없음 → 무시.
// - Type 문자열은 `T5_ARMOR_CLOTH_SET2@1` 같은 enchant 접미 포함 그대로 박는다 (id 필드).
// - name 은 항상 null (killboard 가 displayName 안 줌 — UI 에서 items.json 룩업).
// - role_name 은 인자 그대로 passthrough.

describe('equipmentToBuildSnapshot', () => {
  it('maps all known killboard slots to BuildSnapshot slot keys', () => {
    const equipment: Record<string, EquipmentItem | null> = {
      MainHand: { Type: 'T8_MAIN_HOLYSTAFF@4' },
      OffHand: { Type: 'T8_OFF_BOOK_AVALON' },
      Head: { Type: 'T7_HEAD_CLOTH_SET3@1' },
      Armor: { Type: 'T7_ARMOR_CLOTH_SET3@2' },
      Shoes: { Type: 'T7_SHOES_CLOTH_SET3@1' },
      Cape: { Type: 'T8_CAPEITEM_FW_LYMHURST' },
      Mount: { Type: 'T8_MOUNT_HORSE_UNDEAD' },
      Potion: { Type: 'T7_POTION_HEAL' },
      Food: { Type: 'T8_MEAL_OMELETTE' },
    }
    const result = equipmentToBuildSnapshot(equipment, 'Healer')
    expect(result).toEqual({
      role_name: 'Healer',
      weapon: { name: null, id: 'T8_MAIN_HOLYSTAFF@4' },
      offhand: { name: null, id: 'T8_OFF_BOOK_AVALON' },
      head: { name: null, id: 'T7_HEAD_CLOTH_SET3@1' },
      armor: { name: null, id: 'T7_ARMOR_CLOTH_SET3@2' },
      shoes: { name: null, id: 'T7_SHOES_CLOTH_SET3@1' },
      cape: { name: null, id: 'T8_CAPEITEM_FW_LYMHURST' },
      mount: { name: null, id: 'T8_MOUNT_HORSE_UNDEAD' },
      potion: { name: null, id: 'T7_POTION_HEAL' },
      food: { name: null, id: 'T8_MEAL_OMELETTE' },
    })
  })

  it('ignores Bag (no matching BuildSnapshot slot)', () => {
    // Bag 은 BuildSnapshot 에 슬롯 없음 — 매핑 안 됨이 의도된 동작.
    const equipment: Record<string, EquipmentItem | null> = {
      Bag: { Type: 'T8_BAG' },
      Head: { Type: 'T7_HEAD_PLATE_SET3' },
    }
    const result = equipmentToBuildSnapshot(equipment, null)
    expect(result.head).toEqual({ name: null, id: 'T7_HEAD_PLATE_SET3' })
    // Bag 키는 BuildSnapshot 에 추가되지 않는다.
    expect(Object.keys(result)).not.toContain('bag')
    expect(Object.keys(result)).not.toContain('Bag')
  })

  it('returns all-null slots when equipment is null', () => {
    const result = equipmentToBuildSnapshot(null, 'EngageDps')
    expect(result).toEqual({
      role_name: 'EngageDps',
      weapon: { name: null, id: null },
      offhand: { name: null, id: null },
      head: { name: null, id: null },
      armor: { name: null, id: null },
      shoes: { name: null, id: null },
      cape: { name: null, id: null },
      mount: { name: null, id: null },
      potion: { name: null, id: null },
      food: { name: null, id: null },
    })
  })

  it('returns all-null slots when equipment is empty object', () => {
    const result = equipmentToBuildSnapshot({}, null)
    expect(result.weapon).toEqual({ name: null, id: null })
    expect(result.offhand).toEqual({ name: null, id: null })
    expect(result.role_name).toBeNull()
  })

  it('skips entries whose Type is not a non-empty string', () => {
    const equipment: Record<string, EquipmentItem | null> = {
      // @ts-expect-error — 의도된 잘못된 입력 (런타임 방어 화석화)
      MainHand: { Type: 123 },
      OffHand: { Type: '   ' }, // 공백만 → trim 후 빈 문자열 → skip
      Head: null,
      Armor: { Type: '' }, // 빈 문자열 → skip
      Shoes: { Type: 'T7_SHOES_PLATE_SET3' }, // 정상
    }
    const result = equipmentToBuildSnapshot(equipment, null)
    expect(result.weapon).toEqual({ name: null, id: null })
    expect(result.offhand).toEqual({ name: null, id: null })
    expect(result.head).toEqual({ name: null, id: null })
    expect(result.armor).toEqual({ name: null, id: null })
    expect(result.shoes).toEqual({ name: null, id: 'T7_SHOES_PLATE_SET3' })
  })

  it('trims whitespace from Type before storing as id', () => {
    const equipment: Record<string, EquipmentItem | null> = {
      MainHand: { Type: '  T8_MAIN_HOLYSTAFF@4  ' },
    }
    const result = equipmentToBuildSnapshot(equipment, null)
    expect(result.weapon).toEqual({ name: null, id: 'T8_MAIN_HOLYSTAFF@4' })
  })

  it('ignores unknown killboard slot keys', () => {
    const equipment: Record<string, EquipmentItem | null> = {
      // Albion 이 미래에 새 슬롯을 추가해도 graceful — 매핑 없는 키는 무시.
      MysteryRune: { Type: 'T8_MYSTERY' },
      Head: { Type: 'T7_HEAD_LEATHER_SET3' },
    }
    const result = equipmentToBuildSnapshot(equipment, null)
    expect(result.head).toEqual({ name: null, id: 'T7_HEAD_LEATHER_SET3' })
    expect(Object.keys(result)).not.toContain('MysteryRune')
  })

  it('passes role_name through unchanged (including null)', () => {
    expect(equipmentToBuildSnapshot(null, 'Tank').role_name).toBe('Tank')
    expect(equipmentToBuildSnapshot(null, null).role_name).toBeNull()
    expect(equipmentToBuildSnapshot(null, '').role_name).toBe('')
  })
})

describe('actual participant auto-regear gate', () => {
  const candidates = ['included-member', 'excluded-member']

  it('keeps legacy events unchanged', () => {
    expect(
      applyActualParticipantAutoRegearGate({
        closeoutRequired: false,
        closeoutFinalized: false,
        includedDiscordIds: undefined,
        candidateDiscordIds: candidates,
      }),
    ).toEqual({
      deferred: false,
      candidateDiscordIds: candidates,
    })
  })

  it('defers new events until the immutable closeout exists', () => {
    expect(
      applyActualParticipantAutoRegearGate({
        closeoutRequired: true,
        closeoutFinalized: false,
        includedDiscordIds: undefined,
        candidateDiscordIds: candidates,
      }),
    ).toEqual({
      deferred: true,
      candidateDiscordIds: [],
    })
  })

  it('keeps only administrator-confirmed actual participants', () => {
    expect(
      applyActualParticipantAutoRegearGate({
        closeoutRequired: true,
        closeoutFinalized: true,
        includedDiscordIds: new Set(['included-member']),
        candidateDiscordIds: candidates,
      }),
    ).toEqual({
      deferred: false,
      candidateDiscordIds: ['included-member'],
    })
  })
})
