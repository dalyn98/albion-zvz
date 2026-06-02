import type { Outcome } from './albion-battles'
import type {
  BattleProjectionEvidenceSource,
  BattleProjectionStatus,
  BattleRelationScope,
  BattleResultEstimate,
  BattleViewPolicy,
} from './battle-ledger-shadow'

export type BattleProjectionDiffType =
  | 'missing_shadow_projection'
  | 'missing_legacy_projection'
  | 'opponent_mismatch'
  | 'meaningful_policy_mismatch'
  | 'result_estimate_mismatch'

export interface BattleProjectionDiffSubject {
  tenantId: string
  homeGuildId: string
  homeGuildName: string
}

export interface LegacyBattleProjectionComparisonRow {
  id: string
  tenantId: string
  battleRecordId: string
  homeGuildId: string
  homeGuildName: string
  mainOpponentForceKey: string
  mainOpponentForceKind: 'alliance' | 'guild' | 'pending' | 'legacy'
  mainOpponentForceName: string
  mainOpponentTeamSize: number
  sizeCategory: string | null
  outcome: Outcome
  isProvisional: boolean
  startedAt: string
}

export interface ShadowBattleProjectionComparisonRow {
  battleRecordId: string
  subjectAlbionId: string
  subjectName: string
  relationScope: BattleRelationScope
  opponentForceKey: string
  opponentForceKind: 'guild' | 'alliance'
  opponentForceName: string
  opponentTeamSize: number
  status: BattleProjectionStatus
  evidenceSource: BattleProjectionEvidenceSource
  isMeaningful: boolean
  viewPolicy: BattleViewPolicy
  resultEstimate: BattleResultEstimate
  legacyOutcome: Outcome | null
  evaluatedAt: string
}

export interface BattleProjectionDiffCandidate {
  battleRecordId: string
  legacyTenantId: string | null
  legacyTenantBattleRecordId: string | null
  subjectType: 'guild'
  subjectAlbionId: string
  diffType: BattleProjectionDiffType
  legacyPayload: Record<string, unknown>
  shadowPayload: Record<string, unknown>
  detectedAt: string
}

export interface BattleProjectionDiffBuildInput {
  subjects: BattleProjectionDiffSubject[]
  legacyRows: LegacyBattleProjectionComparisonRow[]
  shadowRows: ShadowBattleProjectionComparisonRow[]
  detectedAt: string
}

export interface BattleProjectionDiffSummary {
  total: number
  byDiffType: Record<BattleProjectionDiffType, number>
  byRelationScope: Partial<Record<BattleRelationScope, number>>
}

const DIFF_TYPES: BattleProjectionDiffType[] = [
  'missing_shadow_projection',
  'missing_legacy_projection',
  'opponent_mismatch',
  'meaningful_policy_mismatch',
  'result_estimate_mismatch',
]

function subjectBattleKey(battleRecordId: string, subjectAlbionId: string): string {
  return `${battleRecordId}:${subjectAlbionId}`
}

function isPendingLegacy(row: LegacyBattleProjectionComparisonRow): boolean {
  return row.isProvisional || row.mainOpponentForceKey === '__pending__'
}

function legacyPayload(row: LegacyBattleProjectionComparisonRow): Record<string, unknown> {
  return {
    tenant_id: row.tenantId,
    tenant_battle_record_id: row.id,
    battle_record_id: row.battleRecordId,
    home_guild_id: row.homeGuildId,
    home_guild_name: row.homeGuildName,
    main_opponent_force_key: row.mainOpponentForceKey,
    main_opponent_force_kind: row.mainOpponentForceKind,
    main_opponent_force_name: row.mainOpponentForceName,
    main_opponent_team_size: row.mainOpponentTeamSize,
    size_category: row.sizeCategory,
    outcome: row.outcome,
    is_provisional: row.isProvisional,
    started_at: row.startedAt,
  }
}

function shadowPayload(row: ShadowBattleProjectionComparisonRow): Record<string, unknown> {
  return {
    battle_record_id: row.battleRecordId,
    subject_albion_id: row.subjectAlbionId,
    subject_name: row.subjectName,
    relation_scope: row.relationScope,
    opponent_force_key: row.opponentForceKey,
    opponent_force_kind: row.opponentForceKind,
    opponent_force_name: row.opponentForceName,
    opponent_team_size: row.opponentTeamSize,
    status: row.status,
    evidence_source: row.evidenceSource,
    is_meaningful: row.isMeaningful,
    view_policy: row.viewPolicy,
    result_estimate: row.resultEstimate,
    legacy_outcome: row.legacyOutcome,
    evaluated_at: row.evaluatedAt,
  }
}

function addCandidate(
  rows: BattleProjectionDiffCandidate[],
  input: {
    battleRecordId: string
    legacyTenantId: string | null
    legacyTenantBattleRecordId: string | null
    subjectAlbionId: string
    diffType: BattleProjectionDiffType
    legacyPayload: Record<string, unknown>
    shadowPayload: Record<string, unknown>
    detectedAt: string
  },
): void {
  rows.push({
    battleRecordId: input.battleRecordId,
    legacyTenantId: input.legacyTenantId,
    legacyTenantBattleRecordId: input.legacyTenantBattleRecordId,
    subjectType: 'guild',
    subjectAlbionId: input.subjectAlbionId,
    diffType: input.diffType,
    legacyPayload: input.legacyPayload,
    shadowPayload: input.shadowPayload,
    detectedAt: input.detectedAt,
  })
}

function findComparableShadow(
  legacy: LegacyBattleProjectionComparisonRow,
  directShadows: ShadowBattleProjectionComparisonRow[],
): ShadowBattleProjectionComparisonRow | null {
  const exact = directShadows.find(
    (shadow) => shadow.opponentForceKey === legacy.mainOpponentForceKey,
  )
  if (exact) return exact
  if (isPendingLegacy(legacy)) {
    return directShadows[0] ?? null
  }
  return null
}

function shouldCompareForceLevel(legacy: LegacyBattleProjectionComparisonRow): boolean {
  return !isPendingLegacy(legacy) && legacy.mainOpponentForceKind !== 'legacy'
}

function buildMissingLegacyPayload(
  shadows: ShadowBattleProjectionComparisonRow[],
): Record<string, unknown> {
  const relationScopes = [...new Set(shadows.map((row) => row.relationScope))]
  return {
    count: shadows.length,
    relation_scopes: relationScopes,
    projections: shadows.map(shadowPayload),
  }
}

export function buildBattleProjectionDiffCandidates(
  input: BattleProjectionDiffBuildInput,
): BattleProjectionDiffCandidate[] {
  const diffs: BattleProjectionDiffCandidate[] = []
  const subjectByGuildId = new Map(
    input.subjects.map((subject) => [subject.homeGuildId, subject]),
  )
  const legacyBySubjectBattle = new Map<string, LegacyBattleProjectionComparisonRow[]>()
  const shadowBySubjectBattle = new Map<string, ShadowBattleProjectionComparisonRow[]>()

  for (const row of input.legacyRows) {
    const key = subjectBattleKey(row.battleRecordId, row.homeGuildId)
    const rows = legacyBySubjectBattle.get(key) ?? []
    rows.push(row)
    legacyBySubjectBattle.set(key, rows)
  }
  for (const row of input.shadowRows) {
    const key = subjectBattleKey(row.battleRecordId, row.subjectAlbionId)
    const rows = shadowBySubjectBattle.get(key) ?? []
    rows.push(row)
    shadowBySubjectBattle.set(key, rows)
  }

  for (const legacy of input.legacyRows) {
    const subjectKey = subjectBattleKey(legacy.battleRecordId, legacy.homeGuildId)
    const directShadows = (shadowBySubjectBattle.get(subjectKey) ?? []).filter(
      (shadow) => shadow.relationScope === 'direct',
    )
    if (directShadows.length === 0) {
      addCandidate(diffs, {
        battleRecordId: legacy.battleRecordId,
        legacyTenantId: legacy.tenantId,
        legacyTenantBattleRecordId: legacy.id,
        subjectAlbionId: legacy.homeGuildId,
        diffType: 'missing_shadow_projection',
        legacyPayload: legacyPayload(legacy),
        shadowPayload: {},
        detectedAt: input.detectedAt,
      })
      continue
    }

    const comparable = findComparableShadow(legacy, directShadows)
    if (!comparable) {
      addCandidate(diffs, {
        battleRecordId: legacy.battleRecordId,
        legacyTenantId: legacy.tenantId,
        legacyTenantBattleRecordId: legacy.id,
        subjectAlbionId: legacy.homeGuildId,
        diffType: 'opponent_mismatch',
        legacyPayload: legacyPayload(legacy),
        shadowPayload: {
          direct_projection_count: directShadows.length,
          direct_projections: directShadows.map(shadowPayload),
        },
        detectedAt: input.detectedAt,
      })
      continue
    }

    if (
      shouldCompareForceLevel(legacy) &&
      comparable.opponentForceKey !== legacy.mainOpponentForceKey
    ) {
      addCandidate(diffs, {
        battleRecordId: legacy.battleRecordId,
        legacyTenantId: legacy.tenantId,
        legacyTenantBattleRecordId: legacy.id,
        subjectAlbionId: legacy.homeGuildId,
        diffType: 'opponent_mismatch',
        legacyPayload: legacyPayload(legacy),
        shadowPayload: shadowPayload(comparable),
        detectedAt: input.detectedAt,
      })
    }

    if (comparable.viewPolicy !== 'default_meaningful') {
      addCandidate(diffs, {
        battleRecordId: legacy.battleRecordId,
        legacyTenantId: legacy.tenantId,
        legacyTenantBattleRecordId: legacy.id,
        subjectAlbionId: legacy.homeGuildId,
        diffType: 'meaningful_policy_mismatch',
        legacyPayload: legacyPayload(legacy),
        shadowPayload: shadowPayload(comparable),
        detectedAt: input.detectedAt,
      })
    }

    if (
      shouldCompareForceLevel(legacy) &&
      comparable.legacyOutcome !== null &&
      comparable.legacyOutcome !== legacy.outcome
    ) {
      addCandidate(diffs, {
        battleRecordId: legacy.battleRecordId,
        legacyTenantId: legacy.tenantId,
        legacyTenantBattleRecordId: legacy.id,
        subjectAlbionId: legacy.homeGuildId,
        diffType: 'result_estimate_mismatch',
        legacyPayload: legacyPayload(legacy),
        shadowPayload: shadowPayload(comparable),
        detectedAt: input.detectedAt,
      })
    }
  }

  for (const [subjectKey, shadows] of shadowBySubjectBattle) {
    const legacyRows = legacyBySubjectBattle.get(subjectKey) ?? []
    const hasPendingLegacy = legacyRows.some(isPendingLegacy)
    const finalLegacyForceKeys = new Set(
      legacyRows
        .filter(shouldCompareForceLevel)
        .map((legacy) => legacy.mainOpponentForceKey),
    )
    const missing = shadows.filter((shadow) => {
      if (shadow.viewPolicy !== 'default_meaningful') return false
      if (shadow.relationScope === 'alliance') return true
      if (legacyRows.length === 0) return true
      if (hasPendingLegacy) return false
      return !finalLegacyForceKeys.has(shadow.opponentForceKey)
    })
    if (missing.length === 0) continue

    const first = missing[0]
    const subject = subjectByGuildId.get(first.subjectAlbionId)
    addCandidate(diffs, {
      battleRecordId: first.battleRecordId,
      legacyTenantId: subject?.tenantId ?? null,
      legacyTenantBattleRecordId: null,
      subjectAlbionId: first.subjectAlbionId,
      diffType: 'missing_legacy_projection',
      legacyPayload: {
        tenant_id: subject?.tenantId ?? null,
        home_guild_id: first.subjectAlbionId,
        home_guild_name: subject?.homeGuildName ?? first.subjectName,
      },
      shadowPayload: buildMissingLegacyPayload(missing),
      detectedAt: input.detectedAt,
    })
  }

  return diffs
}

function relationScopesFromPayload(payload: Record<string, unknown>): BattleRelationScope[] {
  const single = payload.relation_scope
  if (single === 'direct' || single === 'alliance') return [single]
  const many = payload.relation_scopes
  if (!Array.isArray(many)) return []
  return many.filter((value): value is BattleRelationScope =>
    value === 'direct' || value === 'alliance',
  )
}

export function summarizeBattleProjectionDiffs(
  rows: Array<{
    diffType: BattleProjectionDiffType
    shadowPayload: Record<string, unknown>
  }>,
): BattleProjectionDiffSummary {
  const byDiffType = Object.fromEntries(DIFF_TYPES.map((type) => [type, 0])) as Record<
    BattleProjectionDiffType,
    number
  >
  const byRelationScope: Partial<Record<BattleRelationScope, number>> = {}
  for (const row of rows) {
    byDiffType[row.diffType] += 1
    for (const scope of relationScopesFromPayload(row.shadowPayload)) {
      byRelationScope[scope] = (byRelationScope[scope] ?? 0) + 1
    }
  }
  return {
    total: rows.length,
    byDiffType,
    byRelationScope,
  }
}
