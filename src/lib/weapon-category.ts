// Albion weapon item IDs follow the pattern:
//   T{tier}_{slot}_{CATEGORY}[_ARTIFACT][@{enchant}]
// Example IDs:
//   T4_MAIN_SWORD            → SWORD
//   T8_2H_HOLYSTAFF          → HOLYSTAFF
//   T8_2H_HOLYSTAFF_MORGANA  → HOLYSTAFF   (artifact suffix stripped)
//   T4_MAIN_SWORD@2          → SWORD       (enchant suffix stripped)
//
// The category code is kept uppercase — Albion players recognize codes like
// HOLYSTAFF / FIRESTAFF / DAGGERPAIR directly, and keeping it stable makes the
// value a safe map key on both server and client.

const ARTIFACT_SUFFIXES = [
  'AVALON',
  'HELL',
  'KEEPER',
  'MORGANA',
  'UNDEAD',
  'CRYSTAL',
  'DEMON',
]

export function extractWeaponCategory(
  weaponId: string | null | undefined,
): string | null {
  if (!weaponId) return null
  const withoutEnchant = weaponId.split('@')[0]
  const match = withoutEnchant.match(/^T\d+_(?:2H|MAIN)_(.+)$/)
  if (!match) return null
  let category = match[1]
  for (const suffix of ARTIFACT_SUFFIXES) {
    if (category.endsWith(`_${suffix}`)) {
      category = category.slice(0, -(suffix.length + 1))
      break
    }
  }
  return category
}
