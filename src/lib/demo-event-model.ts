import type {
  DemoEventListItem,
  DemoEventSlot,
} from '@/data/demo-seed/events'
import {
  summarizeEventReadiness,
  type EventReadinessSummary,
} from '@/lib/admin-operations-model'

export interface DemoEventSlotGear {
  weapon: string
  weaponId: string | null
  head: string
  headId: string
  armor: string
  armorId: string
  shoes: string
  shoesId: string
}

const WEAPON_ID_BY_NAME: Readonly<Record<string, string>> = {
  'Heavy Mace': 'T8_2H_MACE',
  'Holy Staff': 'T8_MAIN_HOLYSTAFF',
  Locus: 'T8_2H_ENIGMATICORB_MORGANA',
  'Dagger Pair': 'T8_2H_DAGGERPAIR',
  'Brimstone Staff': 'T8_2H_FIRESTAFF_HELL',
  'Heavy Crossbow': 'T8_2H_CROSSBOWLARGE',
}

export function buildDemoEventReadinessMap(
  events: readonly DemoEventListItem[],
): Record<string, EventReadinessSummary> {
  return Object.fromEntries(
    events.map((event) => [
      event.id,
      summarizeEventReadiness({
        totalSlots: event.totalCount,
        assignedSlots: event.filledCount,
      }),
    ]),
  )
}

export function resolveDemoEventSlotGear(slot: DemoEventSlot): DemoEventSlotGear {
  const weapon = slot.weapon
  const weaponId = WEAPON_ID_BY_NAME[weapon] ?? null

  if (slot.role === 'healer') {
    return {
      weapon,
      weaponId,
      head: 'Cleric Cowl',
      headId: 'T8_HEAD_CLOTH_SET2',
      armor: 'Cleric Robe',
      armorId: 'T8_ARMOR_CLOTH_SET2',
      shoes: 'Cleric Sandals',
      shoesId: 'T8_SHOES_CLOTH_SET2',
    }
  }

  if (slot.role === 'support') {
    return {
      weapon,
      weaponId,
      head: 'Knight Helmet',
      headId: 'T8_HEAD_PLATE_SET2',
      armor: 'Judicator Armor',
      armorId: 'T8_ARMOR_PLATE_KEEPER',
      shoes: 'Hunter Shoes',
      shoesId: 'T8_SHOES_LEATHER_SET1',
    }
  }

  if (slot.role === 'engageDps') {
    return {
      weapon,
      weaponId,
      head: 'Royal Hood',
      headId: 'T8_HEAD_CLOTH_ROYAL',
      armor: 'Cleric Robe',
      armorId: 'T8_ARMOR_CLOTH_SET2',
      shoes: 'Scholar Sandals',
      shoesId: 'T8_SHOES_CLOTH_SET1',
    }
  }

  return {
    weapon,
    weaponId,
    head: 'Judicator Helmet',
    headId: 'T8_HEAD_PLATE_KEEPER',
    armor: 'Judicator Armor',
    armorId: 'T8_ARMOR_PLATE_KEEPER',
    shoes: 'Hunter Shoes',
    shoesId: 'T8_SHOES_LEATHER_SET1',
  }
}
