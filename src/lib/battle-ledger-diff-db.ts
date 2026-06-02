import 'server-only'

import type { getAdminClient } from './supabase-admin'
import {
  buildBattleProjectionDiffCandidates,
  summarizeBattleProjectionDiffs,
  type BattleProjectionDiffCandidate,
  type BattleProjectionDiffSubject,
  type BattleProjectionDiffSummary,
  type BattleProjectionDiffType,
  type LegacyBattleProjectionComparisonRow,
  type ShadowBattleProjectionComparisonRow,
} from './battle-ledger-diff'
import type { Outcome } from './albion-battles'
import type {
  BattleProjectionEvidenceSource,
  BattleProjectionStatus,
  BattleRelationScope,
  BattleResultEstimate,
  BattleViewPolicy,
} from './battle-ledger-shadow'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

interface RefreshBattleProjectionDiffsInput {
  db: SupabaseAdminClient
  battleRecordIds: string[]
  subjects: BattleProjectionDiffSubject[]
  comparedAt: string
}

export interface RefreshBattleProjectionDiffsResult {
  comparedBattleRecords: number
  activeDiffs: number
  insertedDiffs: number
  refreshedDiffs: number
  reactivatedDiffs: number
  resolvedDiffs: number
  errors: string[]
}

interface LegacyDiffDbRow {
  id: string
  guild_id: string
  battle_record_id: string
  home_guild_id: string
  home_guild_name: string
  main_opponent_force_key: string
  main_opponent_force_kind: 'alliance' | 'guild' | 'pending' | 'legacy'
  main_opponent_force_name: string
  main_opponent_team_size: number
  size_category: string | null
  outcome: Outcome
  is_provisional: boolean
  started_at: string
}

interface ShadowDiffDbRow {
  battle_record_id: string
  subject_albion_id: string
  subject_name: string
  relation_scope: BattleRelationScope
  opponent_force_key: string
  opponent_force_kind: 'guild' | 'alliance'
  opponent_force_name: string
  opponent_team_size: number
  status: BattleProjectionStatus
  evidence_source: BattleProjectionEvidenceSource
  is_meaningful: boolean
  view_policy: BattleViewPolicy
  result_estimate: BattleResultEstimate
  legacy_outcome: Outcome | null
  evaluated_at: string
}

interface ExistingDiffDbRow {
  id: string
  battle_record_id: string
  legacy_tenant_battle_record_id: string | null
  subject_type: 'guild'
  subject_albion_id: string
  diff_type: BattleProjectionDiffType
  resolved_at: string | null
}

interface DiffReportDbRow {
  id: string
  battle_record_id: string
  legacy_tenant_id: string | null
  legacy_tenant_battle_record_id: string | null
  subject_albion_id: string
  diff_type: BattleProjectionDiffType
  legacy_payload: unknown
  shadow_payload: unknown
  detected_at: string
  resolved_at: string | null
}

export interface BattleProjectionDiffReportRow {
  id: string
  battleRecordId: string
  legacyTenantId: string | null
  legacyTenantBattleRecordId: string | null
  subjectAlbionId: string
  diffType: BattleProjectionDiffType
  legacyPayload: Record<string, unknown>
  shadowPayload: Record<string, unknown>
  detectedAt: string
  resolvedAt: string | null
}

export interface BattleProjectionDiffReport {
  generatedAt: string
  active: BattleProjectionDiffSummary
  recentResolved: BattleProjectionDiffSummary
  activeSamples: BattleProjectionDiffReportRow[]
  recentResolvedSamples: BattleProjectionDiffReportRow[]
}

const DIFF_REPORT_PAGE_SIZE = 1000
const COMPARISON_PAGE_SIZE = 1000
const WRITE_BATCH_SIZE = 500
const DIFF_REPORT_SELECT =
  'id, battle_record_id, legacy_tenant_id, legacy_tenant_battle_record_id, subject_albion_id, diff_type, legacy_payload, shadow_payload, detected_at, resolved_at'

interface PagedQuery<T> {
  range(from: number, to: number): PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size))
  }
  return result
}

function toLegacyRow(row: LegacyDiffDbRow): LegacyBattleProjectionComparisonRow {
  return {
    id: row.id,
    tenantId: row.guild_id,
    battleRecordId: row.battle_record_id,
    homeGuildId: row.home_guild_id,
    homeGuildName: row.home_guild_name,
    mainOpponentForceKey: row.main_opponent_force_key,
    mainOpponentForceKind: row.main_opponent_force_kind,
    mainOpponentForceName: row.main_opponent_force_name,
    mainOpponentTeamSize: row.main_opponent_team_size,
    sizeCategory: row.size_category,
    outcome: row.outcome,
    isProvisional: row.is_provisional,
    startedAt: row.started_at,
  }
}

function toShadowRow(row: ShadowDiffDbRow): ShadowBattleProjectionComparisonRow {
  return {
    battleRecordId: row.battle_record_id,
    subjectAlbionId: row.subject_albion_id,
    subjectName: row.subject_name,
    relationScope: row.relation_scope,
    opponentForceKey: row.opponent_force_key,
    opponentForceKind: row.opponent_force_kind,
    opponentForceName: row.opponent_force_name,
    opponentTeamSize: row.opponent_team_size,
    status: row.status,
    evidenceSource: row.evidence_source,
    isMeaningful: row.is_meaningful,
    viewPolicy: row.view_policy,
    resultEstimate: row.result_estimate,
    legacyOutcome: row.legacy_outcome,
    evaluatedAt: row.evaluated_at,
  }
}

function candidateKey(row: {
  battleRecordId: string
  subjectAlbionId: string
  diffType: BattleProjectionDiffType
  legacyTenantBattleRecordId: string | null
}): string {
  return [
    row.battleRecordId,
    'guild',
    row.subjectAlbionId,
    row.diffType,
    row.legacyTenantBattleRecordId ?? '',
  ].join(':')
}

function existingKey(row: ExistingDiffDbRow): string {
  return [
    row.battle_record_id,
    row.subject_type,
    row.subject_albion_id,
    row.diff_type,
    row.legacy_tenant_battle_record_id ?? '',
  ].join(':')
}

function candidateToDb(row: BattleProjectionDiffCandidate): Record<string, unknown> {
  return {
    battle_record_id: row.battleRecordId,
    legacy_tenant_id: row.legacyTenantId,
    legacy_tenant_battle_record_id: row.legacyTenantBattleRecordId,
    subject_type: row.subjectType,
    subject_albion_id: row.subjectAlbionId,
    diff_type: row.diffType,
    legacy_payload: row.legacyPayload,
    shadow_payload: row.shadowPayload,
    detected_at: row.detectedAt,
    resolved_at: null,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function reportRow(row: DiffReportDbRow): BattleProjectionDiffReportRow {
  return {
    id: row.id,
    battleRecordId: row.battle_record_id,
    legacyTenantId: row.legacy_tenant_id,
    legacyTenantBattleRecordId: row.legacy_tenant_battle_record_id,
    subjectAlbionId: row.subject_albion_id,
    diffType: row.diff_type,
    legacyPayload: asRecord(row.legacy_payload),
    shadowPayload: asRecord(row.shadow_payload),
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at,
  }
}

async function selectPagedRows<T>(input: {
  buildQuery: () => PagedQuery<T>
  label: string
  pageSize: number
}): Promise<{ rows: T[]; error?: string }> {
  const rows: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await input
      .buildQuery()
      .range(from, from + input.pageSize - 1)
    if (error) return { rows, error: `${input.label}: ${error.message}` }

    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < input.pageSize) break
    from += input.pageSize
  }

  return { rows }
}

async function selectDiffReportRows(input: {
  db: SupabaseAdminClient
  kind: 'active' | 'recentResolved'
  recentResolvedSince?: string
}): Promise<BattleProjectionDiffReportRow[]> {
  const rows: BattleProjectionDiffReportRow[] = []
  let from = 0

  while (true) {
    let query = input.db.from('battle_projection_diffs').select(DIFF_REPORT_SELECT)

    if (input.kind === 'active') {
      query = query
        .is('resolved_at', null)
        .order('detected_at', { ascending: false })
        .order('id', { ascending: true })
    } else {
      query = query
        .not('resolved_at', 'is', null)
        .gte('resolved_at', input.recentResolvedSince ?? '')
        .order('resolved_at', { ascending: false })
        .order('id', { ascending: true })
    }

    const { data, error } = await query.range(from, from + DIFF_REPORT_PAGE_SIZE - 1)
    if (error) {
      const label = input.kind === 'active' ? 'active' : 'resolved'
      throw new Error(`${label} projection diff report: ${error.message}`)
    }

    const batch = (data ?? []) as DiffReportDbRow[]
    rows.push(...batch.map(reportRow))
    if (batch.length < DIFF_REPORT_PAGE_SIZE) break
    from += DIFF_REPORT_PAGE_SIZE
  }

  return rows
}

async function selectComparisonRows(input: {
  db: SupabaseAdminClient
  battleRecordIds: string[]
  tenantIds: string[]
  subjectAlbionIds: string[]
}): Promise<{
  legacyRows: LegacyBattleProjectionComparisonRow[]
  shadowRows: ShadowBattleProjectionComparisonRow[]
  existingRows: ExistingDiffDbRow[]
  errors: string[]
}> {
  const errors: string[] = []
  const [legacyRes, shadowRes, existingRes] = await Promise.all([
    selectPagedRows<LegacyDiffDbRow>({
      label: 'legacy comparison select',
      pageSize: COMPARISON_PAGE_SIZE,
      buildQuery: () =>
        input.db
          .from('tenant_battle_records')
          .select(
            'id, guild_id, battle_record_id, home_guild_id, home_guild_name, main_opponent_force_key, main_opponent_force_kind, main_opponent_force_name, main_opponent_team_size, size_category, outcome, is_provisional, started_at',
          )
          .in('battle_record_id', input.battleRecordIds)
          .in('guild_id', input.tenantIds)
          .order('battle_record_id', { ascending: true })
          .order('guild_id', { ascending: true })
          .order('id', { ascending: true }) as unknown as PagedQuery<LegacyDiffDbRow>,
    }),
    selectPagedRows<ShadowDiffDbRow>({
      label: 'shadow comparison select',
      pageSize: COMPARISON_PAGE_SIZE,
      buildQuery: () =>
        input.db
          .from('battle_view_projections')
          .select(
            'battle_record_id, subject_albion_id, subject_name, relation_scope, opponent_force_key, opponent_force_kind, opponent_force_name, opponent_team_size, status, evidence_source, is_meaningful, view_policy, result_estimate, legacy_outcome, evaluated_at',
          )
          .in('battle_record_id', input.battleRecordIds)
          .eq('subject_type', 'guild')
          .in('subject_albion_id', input.subjectAlbionIds)
          .order('battle_record_id', { ascending: true })
          .order('subject_albion_id', { ascending: true })
          .order('relation_scope', { ascending: true })
          .order('opponent_force_key', { ascending: true }) as unknown as PagedQuery<ShadowDiffDbRow>,
    }),
    selectPagedRows<ExistingDiffDbRow>({
      label: 'existing diff select',
      pageSize: COMPARISON_PAGE_SIZE,
      buildQuery: () =>
        input.db
          .from('battle_projection_diffs')
          .select(
            'id, battle_record_id, legacy_tenant_battle_record_id, subject_type, subject_albion_id, diff_type, resolved_at',
          )
          .in('battle_record_id', input.battleRecordIds)
          .in('subject_albion_id', input.subjectAlbionIds)
          .order('battle_record_id', { ascending: true })
          .order('subject_albion_id', { ascending: true })
          .order('id', { ascending: true }) as unknown as PagedQuery<ExistingDiffDbRow>,
    }),
  ])

  if (legacyRes.error) errors.push(legacyRes.error)
  if (shadowRes.error) errors.push(shadowRes.error)
  if (existingRes.error) errors.push(existingRes.error)

  return {
    legacyRows: legacyRes.rows.map(toLegacyRow),
    shadowRows: shadowRes.rows.map(toShadowRow),
    existingRows: existingRes.rows,
    errors,
  }
}

export async function refreshBattleProjectionDiffs(
  input: RefreshBattleProjectionDiffsInput,
): Promise<RefreshBattleProjectionDiffsResult> {
  const battleRecordIds = unique(input.battleRecordIds)
  const tenantIds = unique(input.subjects.map((subject) => subject.tenantId))
  const subjectAlbionIds = unique(input.subjects.map((subject) => subject.homeGuildId))
  const errors: string[] = []

  if (battleRecordIds.length === 0 || tenantIds.length === 0 || subjectAlbionIds.length === 0) {
    return {
      comparedBattleRecords: 0,
      activeDiffs: 0,
      insertedDiffs: 0,
      refreshedDiffs: 0,
      reactivatedDiffs: 0,
      resolvedDiffs: 0,
      errors,
    }
  }

  const comparison = await selectComparisonRows({
    db: input.db,
    battleRecordIds,
    tenantIds,
    subjectAlbionIds,
  })
  errors.push(...comparison.errors)
  if (errors.length > 0) {
    return {
      comparedBattleRecords: battleRecordIds.length,
      activeDiffs: 0,
      insertedDiffs: 0,
      refreshedDiffs: 0,
      reactivatedDiffs: 0,
      resolvedDiffs: 0,
      errors,
    }
  }

  const candidates = buildBattleProjectionDiffCandidates({
    subjects: input.subjects,
    legacyRows: comparison.legacyRows,
    shadowRows: comparison.shadowRows,
    detectedAt: input.comparedAt,
  })
  const activeKeys = new Set(candidates.map(candidateKey))
  const existingByKey = new Map(comparison.existingRows.map((row) => [existingKey(row), row]))
  const staleActiveIds = comparison.existingRows
    .filter((row) => row.resolved_at === null && !activeKeys.has(existingKey(row)))
    .map((row) => row.id)

  let resolvedDiffs = 0
  if (staleActiveIds.length > 0) {
    for (const staleIds of chunks(staleActiveIds, WRITE_BATCH_SIZE)) {
      const { error } = await input.db
        .from('battle_projection_diffs')
        .update({ resolved_at: input.comparedAt })
        .in('id', staleIds)
      if (error) {
        errors.push(`resolve projection diffs: ${error.message}`)
      } else {
        resolvedDiffs += staleIds.length
      }
    }
  }

  const inserts: Record<string, unknown>[] = []
  let refreshedDiffs = 0
  let reactivatedDiffs = 0
  for (const candidate of candidates) {
    const existing = existingByKey.get(candidateKey(candidate))
    if (!existing) {
      inserts.push(candidateToDb(candidate))
      continue
    }
    const { error } = await input.db
      .from('battle_projection_diffs')
      .update({
        legacy_tenant_id: candidate.legacyTenantId,
        legacy_payload: candidate.legacyPayload,
        shadow_payload: candidate.shadowPayload,
        detected_at: candidate.detectedAt,
        resolved_at: null,
      })
      .eq('id', existing.id)
    if (error) {
      errors.push(`refresh projection diff ${existing.id}: ${error.message}`)
      continue
    }
    if (existing.resolved_at) {
      reactivatedDiffs++
    } else {
      refreshedDiffs++
    }
  }

  let insertedDiffs = 0
  if (inserts.length > 0) {
    for (const insertRows of chunks(inserts, WRITE_BATCH_SIZE)) {
      const { error } = await input.db.from('battle_projection_diffs').insert(insertRows)
      if (error) {
        errors.push(`insert projection diffs: ${error.message}`)
      } else {
        insertedDiffs += insertRows.length
      }
    }
  }

  return {
    comparedBattleRecords: battleRecordIds.length,
    activeDiffs: candidates.length,
    insertedDiffs,
    refreshedDiffs,
    reactivatedDiffs,
    resolvedDiffs,
    errors,
  }
}

export async function getBattleProjectionDiffReport(input: {
  db: SupabaseAdminClient
  recentResolvedSince: string
  sampleLimit: number
}): Promise<BattleProjectionDiffReport> {
  const [activeRows, recentResolvedRows] = await Promise.all([
    selectDiffReportRows({ db: input.db, kind: 'active' }),
    selectDiffReportRows({
      db: input.db,
      kind: 'recentResolved',
      recentResolvedSince: input.recentResolvedSince,
    }),
  ])

  return {
    generatedAt: new Date().toISOString(),
    active: summarizeBattleProjectionDiffs(activeRows),
    recentResolved: summarizeBattleProjectionDiffs(recentResolvedRows),
    activeSamples: activeRows.slice(0, input.sampleLimit),
    recentResolvedSamples: recentResolvedRows.slice(0, input.sampleLimit),
  }
}
