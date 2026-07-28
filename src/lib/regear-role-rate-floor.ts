import { isValidRoleRegearPayoutRate } from '@/lib/regear-payout'

export interface RegearDiscordRoleRateFloor {
  id: string
  discordRoleId: string
  discordRoleName: string
  minimumPayoutRatePercent: number
  updatedAt: string
}

export interface RegearDiscordRoleRateFloorSnapshot {
  discordRoleId: string
  discordRoleName: string
  minimumPayoutRatePercent: number
}

export function resolveRegearDiscordRoleRateFloor(
  memberRoleIds: readonly string[],
  policies: readonly RegearDiscordRoleRateFloor[],
): RegearDiscordRoleRateFloor | null {
  const memberRoleIdSet = new Set(memberRoleIds)
  return (
    policies
      .filter(
        (policy) =>
          memberRoleIdSet.has(policy.discordRoleId) &&
          isValidRoleRegearPayoutRate(policy.minimumPayoutRatePercent),
      )
      .sort(
        (a, b) =>
          b.minimumPayoutRatePercent - a.minimumPayoutRatePercent ||
          a.discordRoleId.localeCompare(b.discordRoleId),
      )[0] ?? null
  )
}

export function toRegearDiscordRoleRateFloorSnapshot(
  policy: RegearDiscordRoleRateFloor | null,
): RegearDiscordRoleRateFloorSnapshot | null {
  if (!policy) return null
  return {
    discordRoleId: policy.discordRoleId,
    discordRoleName: policy.discordRoleName,
    minimumPayoutRatePercent: policy.minimumPayoutRatePercent,
  }
}
