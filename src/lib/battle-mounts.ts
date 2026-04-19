// Battle mount uniqueName → disarray contribution.
//
// In Albion, battle mounts count as *extra* players for Disarray scaling: the
// effective headcount used to pick a Disarray level is `human_players + sum of
// mount contributions`. Values are from the wiki Disarray table per mount type.
export const MOUNT_DISARRAY: Record<string, number> = {
  T6_MOUNT_SIEGE_BALLISTA: 2,
  UNIQUE_MOUNT_ARMORED_EAGLE_SILVER: 4,
  UNIQUE_MOUNT_RHINO_SEASON_SILVER: 2,
  UNIQUE_MOUNT_ENT_SILVER: 2,
  // Command Mammoth only ships as the @1 enchant variant upstream.
  'T8_MOUNT_MAMMOTH_BATTLE@1': 5,
  UNIQUE_MOUNT_BEETLE_SILVER: 5,
  UNIQUE_MOUNT_TOWER_CHARIOT_SILVER: 5,
  UNIQUE_MOUNT_JUGGERNAUT_SILVER: 4,
  UNIQUE_MOUNT_BASTION_SILVER: 5,
  UNIQUE_MOUNT_BEHEMOTH_SILVER: 4,
  UNIQUE_MOUNT_BATTLESPIDER_SILVER: 3,
  UNIQUE_MOUNT_TANKBEETLE_SILVER: 2,
  T7_MOUNT_ARMORED_SWAMPDRAGON_BATTLE: 5,
  T7_MOUNT_SWAMPDRAGON_BATTLE: 5,
}

export function getMountDisarray(itemId: string | null | undefined): number {
  if (!itemId) return 0
  return MOUNT_DISARRAY[itemId] ?? 0
}

export function isBattleMount(itemId: string | null | undefined): boolean {
  return !!itemId && itemId in MOUNT_DISARRAY
}
