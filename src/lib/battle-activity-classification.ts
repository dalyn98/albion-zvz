import { isLowEngagement } from '@/lib/low-engagement-cut'

export const DISARRAY_FORCE_MIN_SIZE = 21
export const LARGE_PARTY_MIN_SIZE = 18
export const MEANINGFUL_FORCE_MIN_SIZE = 10
export const SHORT_BATTLE_SECONDS = 120

export const BATTLE_ACTIVITY_KINDS = [
  'zvz',
  'smallscale',
  'ganking',
  'low_engagement',
  'review',
  'excluded',
] as const

export type BattleActivityKind = (typeof BATTLE_ACTIVITY_KINDS)[number]

export const BATTLE_ACTIVITY_SOURCES = [
  'automatic',
  'event_intent',
  'manual',
] as const

export type BattleActivitySource = (typeof BATTLE_ACTIVITY_SOURCES)[number]

export interface BattleActivitySignals {
  subjectTeamSize: number
  subjectKills: number
  subjectDeaths: number
  opponentTeamSize: number
  opponentKills: number
  opponentDeaths: number
  battleDurationSeconds?: number | null
  opponentForceCount?: number | null
  smallOpponentForceCount?: number | null
}

export interface BattleActivityClassification {
  kind: BattleActivityKind
  source: 'automatic'
  reason: string
}

function isShortBattle(seconds: number | null | undefined): boolean {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds < SHORT_BATTLE_SECONDS
}

function hasMutualEngagement(signals: BattleActivitySignals): boolean {
  return (
    signals.subjectKills > 0 &&
    signals.subjectDeaths > 0 &&
    signals.opponentKills > 0 &&
    signals.opponentDeaths > 0
  )
}

function isOneSidedCatch(signals: BattleActivitySignals): boolean {
  return (
    signals.subjectKills >= 3 &&
    signals.subjectDeaths <= 1 &&
    signals.opponentKills <= 1
  )
}

function hasFragmentedOpposition(signals: BattleActivitySignals): boolean {
  const forceCount = signals.opponentForceCount ?? 0
  const smallForceCount = signals.smallOpponentForceCount ?? 0
  return forceCount >= 3 && smallForceCount >= Math.ceil(forceCount / 2)
}

export function classifyBattleActivity(
  signals: BattleActivitySignals,
): BattleActivityClassification {
  if (
    signals.subjectTeamSize < MEANINGFUL_FORCE_MIN_SIZE ||
    signals.opponentTeamSize < MEANINGFUL_FORCE_MIN_SIZE ||
    isLowEngagement({
      homeKills: signals.subjectKills,
      homeDeaths: signals.subjectDeaths,
      homeTeamSize: signals.subjectTeamSize,
    })
  ) {
    return {
      kind: 'low_engagement',
      source: 'automatic',
      reason: 'low_engagement_or_force_floor',
    }
  }

  const subjectHasDisarrayScale = signals.subjectTeamSize >= DISARRAY_FORCE_MIN_SIZE
  const opponentHasDisarrayScale = signals.opponentTeamSize >= DISARRAY_FORCE_MIN_SIZE
  const bothDisarrayScale = subjectHasDisarrayScale && opponentHasDisarrayScale
  const bothLargeParty =
    signals.subjectTeamSize >= LARGE_PARTY_MIN_SIZE &&
    signals.opponentTeamSize >= LARGE_PARTY_MIN_SIZE
  const oneSidedCatch = isOneSidedCatch(signals)
  const shortBattle = isShortBattle(signals.battleDurationSeconds)
  const fragmentedOpposition = hasFragmentedOpposition(signals)
  const mutualEngagement = hasMutualEngagement(signals)

  if (bothDisarrayScale && !(shortBattle && oneSidedCatch && !mutualEngagement)) {
    return {
      kind: 'zvz',
      source: 'automatic',
      reason: 'disarray_scale_mutual_or_sustained',
    }
  }

  if (
    subjectHasDisarrayScale &&
    !opponentHasDisarrayScale &&
    (oneSidedCatch || fragmentedOpposition)
  ) {
    return {
      kind: 'ganking',
      source: 'automatic',
      reason: 'zerg_party_vs_fragmented_opposition',
    }
  }

  if (
    signals.subjectTeamSize <= DISARRAY_FORCE_MIN_SIZE - 1 &&
    (oneSidedCatch || fragmentedOpposition) &&
    (shortBattle || signals.subjectTeamSize >= LARGE_PARTY_MIN_SIZE)
  ) {
    return {
      kind: 'ganking',
      source: 'automatic',
      reason: 'large_party_one_sided_catch',
    }
  }

  if (bothLargeParty && mutualEngagement) {
    return {
      kind: 'smallscale',
      source: 'automatic',
      reason: 'large_party_mutual_below_zvz_threshold',
    }
  }

  if (bothDisarrayScale) {
    return {
      kind: 'review',
      source: 'automatic',
      reason: 'disarray_scale_short_one_sided',
    }
  }

  return {
    kind: 'smallscale',
    source: 'automatic',
    reason: 'meaningful_smallscale',
  }
}

export function battleActivityViewPolicy(
  kind: BattleActivityKind,
): 'default_meaningful' | 'small_or_low_engagement' {
  return kind === 'zvz' ? 'default_meaningful' : 'small_or_low_engagement'
}
