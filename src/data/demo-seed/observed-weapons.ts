import type { DemoKillEvent } from './kills'
import type { DemoWeaponKey } from './members'

export interface DemoObservedWeaponCategory {
  weapon: DemoWeaponKey
  observationCount: number
}

export interface DemoObservedWeaponUsage {
  source: 'killboard_equipment'
  windowDays: 30
  sampleCount: number
  categories: DemoObservedWeaponCategory[]
}

function observedWeaponKey(raw: string): DemoWeaponKey | null {
  const normalized = raw.toLowerCase()
  if (normalized.includes('mace') || normalized.includes('morning star')) {
    return 'mace'
  }
  if (normalized.includes('fire') || normalized.includes('brimstone')) {
    return 'fire'
  }
  if (
    normalized.includes('holy') ||
    normalized.includes('blight') ||
    normalized.includes('lifestaff')
  ) {
    return 'lifestaff'
  }
  if (normalized.includes('dagger')) return 'dagger'
  if (normalized.includes('crossbow')) return 'crossbow'
  return null
}

// Demo member details use the same evidence identity as production:
// one member + normalized weapon family + battle contributes at most once.
export function resolveDemoObservedWeaponUsage(
  events: ReadonlyArray<DemoKillEvent>,
): DemoObservedWeaponUsage {
  const evidenceByWeapon = new Map<DemoWeaponKey, Set<string>>()
  for (const event of events) {
    const weapon = observedWeaponKey(event.weapon)
    if (!weapon || !event.battleId) continue
    const evidence = evidenceByWeapon.get(weapon) ?? new Set<string>()
    evidence.add(event.battleId)
    evidenceByWeapon.set(weapon, evidence)
  }
  const categories = [...evidenceByWeapon.entries()]
    .map(([weapon, evidence]) => ({
      weapon,
      observationCount: evidence.size,
    }))
    .sort(
      (left, right) =>
        right.observationCount - left.observationCount ||
        left.weapon.localeCompare(right.weapon),
    )
  return {
    source: 'killboard_equipment',
    windowDays: 30,
    sampleCount: categories.reduce(
      (sum, category) => sum + category.observationCount,
      0,
    ),
    categories,
  }
}

// Public demo data is an explicit observed-equipment fixture. It is not
// derived from DemoMember.primaryWeapon, which represents planned composition.
export const DEMO_GUILD_OBSERVED_WEAPON_USAGE: DemoObservedWeaponUsage = {
  source: 'killboard_equipment',
  windowDays: 30,
  sampleCount: 72,
  categories: [
    { weapon: 'mace', observationCount: 22 },
    { weapon: 'lifestaff', observationCount: 19 },
    { weapon: 'fire', observationCount: 14 },
    { weapon: 'dagger', observationCount: 10 },
    { weapon: 'crossbow', observationCount: 7 },
  ],
}
