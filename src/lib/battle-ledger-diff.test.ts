import { describe, expect, it } from 'vitest'
import {
  buildBattleProjectionDiffCandidates,
  summarizeBattleProjectionDiffs,
  type LegacyBattleProjectionComparisonRow,
  type ShadowBattleProjectionComparisonRow,
} from './battle-ledger-diff'

const TENANT_ID = 'tenant-1'
const HOME_GUILD_ID = 'home-guild'
const BATTLE_RECORD_ID = 'battle-record-1'
const DETECTED_AT = '2026-06-01T10:00:00Z'

function legacy(
  overrides: Partial<LegacyBattleProjectionComparisonRow> = {},
): LegacyBattleProjectionComparisonRow {
  return {
    id: overrides.id ?? 'legacy-row-1',
    tenantId: overrides.tenantId ?? TENANT_ID,
    battleRecordId: overrides.battleRecordId ?? BATTLE_RECORD_ID,
    homeGuildId: overrides.homeGuildId ?? HOME_GUILD_ID,
    homeGuildName: overrides.homeGuildName ?? 'Menhera',
    mainOpponentForceKey: overrides.mainOpponentForceKey ?? 'a:opponent-alliance',
    mainOpponentForceKind: overrides.mainOpponentForceKind ?? 'alliance',
    mainOpponentForceName: overrides.mainOpponentForceName ?? 'Opponent',
    mainOpponentTeamSize: overrides.mainOpponentTeamSize ?? 30,
    sizeCategory: overrides.sizeCategory ?? 'small',
    outcome: overrides.outcome ?? 'win',
    isProvisional: overrides.isProvisional ?? false,
    startedAt: overrides.startedAt ?? '2026-06-01T09:40:00Z',
  }
}

function shadow(
  overrides: Partial<ShadowBattleProjectionComparisonRow> = {},
): ShadowBattleProjectionComparisonRow {
  return {
    battleRecordId: overrides.battleRecordId ?? BATTLE_RECORD_ID,
    subjectAlbionId: overrides.subjectAlbionId ?? HOME_GUILD_ID,
    subjectName: overrides.subjectName ?? 'Menhera',
    relationScope: overrides.relationScope ?? 'direct',
    opponentForceKey: overrides.opponentForceKey ?? 'a:opponent-alliance',
    opponentForceKind: overrides.opponentForceKind ?? 'alliance',
    opponentForceName: overrides.opponentForceName ?? 'Opponent',
    opponentTeamSize: overrides.opponentTeamSize ?? 30,
    status: overrides.status ?? 'provisional',
    evidenceSource: overrides.evidenceSource ?? 'battle_summary',
    isMeaningful: overrides.isMeaningful ?? true,
    viewPolicy: overrides.viewPolicy ?? 'default_meaningful',
    resultEstimate: overrides.resultEstimate ?? 'advantage',
    legacyOutcome: overrides.legacyOutcome ?? 'win',
    evaluatedAt: overrides.evaluatedAt ?? DETECTED_AT,
  }
}

function build(input: {
  legacyRows?: LegacyBattleProjectionComparisonRow[]
  shadowRows?: ShadowBattleProjectionComparisonRow[]
}) {
  return buildBattleProjectionDiffCandidates({
    subjects: [
      {
        tenantId: TENANT_ID,
        homeGuildId: HOME_GUILD_ID,
        homeGuildName: 'Menhera',
      },
    ],
    legacyRows: input.legacyRows ?? [],
    shadowRows: input.shadowRows ?? [],
    detectedAt: DETECTED_AT,
  })
}

describe('buildBattleProjectionDiffCandidates', () => {
  it('does not emit a diff when final legacy and direct shadow projection match', () => {
    expect(build({ legacyRows: [legacy()], shadowRows: [shadow()] })).toEqual([])
  })

  it('emits missing_shadow_projection when a legacy row has no direct shadow projection', () => {
    const [diff] = build({ legacyRows: [legacy()], shadowRows: [] })

    expect(diff).toMatchObject({
      diffType: 'missing_shadow_projection',
      legacyTenantId: TENANT_ID,
      legacyTenantBattleRecordId: 'legacy-row-1',
      subjectAlbionId: HOME_GUILD_ID,
    })
  })

  it('aggregates missing direct and alliance shadow projections into one missing_legacy_projection diff', () => {
    const diffs = build({
      shadowRows: [
        shadow({ relationScope: 'direct', opponentForceKey: 'a:direct-opp' }),
        shadow({ relationScope: 'alliance', opponentForceKey: 'a:alliance-opp' }),
        shadow({
          relationScope: 'direct',
          opponentForceKey: 'g:tiny-opp',
          isMeaningful: false,
          viewPolicy: 'small_or_low_engagement',
        }),
      ],
    })

    expect(diffs).toHaveLength(1)
    expect(diffs[0]).toMatchObject({
      diffType: 'missing_legacy_projection',
      legacyTenantBattleRecordId: null,
      shadowPayload: {
        count: 2,
        relation_scopes: ['direct', 'alliance'],
      },
    })
  })

  it('does not treat pending legacy rows as force-level mismatches before final evaluation', () => {
    const diffs = build({
      legacyRows: [
        legacy({
          mainOpponentForceKey: '__pending__',
          mainOpponentForceKind: 'pending',
          isProvisional: true,
        }),
      ],
      shadowRows: [shadow({ opponentForceKey: 'a:resolved-force' })],
    })

    expect(diffs).toEqual([])
  })

  it('emits opponent and result mismatches for finalized rows with different force or outcome', () => {
    const diffs = build({
      legacyRows: [
        legacy({
          mainOpponentForceKey: 'a:legacy-force',
          outcome: 'loss',
        }),
      ],
      shadowRows: [
        shadow({
          opponentForceKey: 'a:shadow-force',
          legacyOutcome: 'win',
        }),
      ],
    })

    expect(diffs.map((diff) => diff.diffType)).toEqual(
      expect.arrayContaining(['opponent_mismatch', 'missing_legacy_projection']),
    )
  })

  it('emits result_estimate_mismatch when the same force has a different outcome', () => {
    const [diff] = build({
      legacyRows: [legacy({ outcome: 'loss' })],
      shadowRows: [shadow({ legacyOutcome: 'win' })],
    })

    expect(diff).toMatchObject({
      diffType: 'result_estimate_mismatch',
      legacyTenantBattleRecordId: 'legacy-row-1',
    })
  })

  it('emits meaningful_policy_mismatch when legacy stores a row that shadow marks low-engagement', () => {
    const [diff] = build({
      legacyRows: [legacy()],
      shadowRows: [
        shadow({
          isMeaningful: false,
          viewPolicy: 'small_or_low_engagement',
        }),
      ],
    })

    expect(diff).toMatchObject({ diffType: 'meaningful_policy_mismatch' })
  })
})

describe('summarizeBattleProjectionDiffs', () => {
  it('summarizes by diff type and relation scope', () => {
    const diffs = build({
      shadowRows: [
        shadow({ relationScope: 'direct', opponentForceKey: 'a:direct-opp' }),
        shadow({ relationScope: 'alliance', opponentForceKey: 'a:alliance-opp' }),
      ],
    })

    expect(
      summarizeBattleProjectionDiffs(
        diffs.map((diff) => ({
          diffType: diff.diffType,
          shadowPayload: diff.shadowPayload,
        })),
      ),
    ).toMatchObject({
      total: 1,
      byDiffType: { missing_legacy_projection: 1 },
      byRelationScope: { direct: 1, alliance: 1 },
    })
  })
})
