import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const boardPath = 'src/app/(public-shell)/public/(marketing)/zvz-battles/page.tsx'
const guildRecordPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/guild/[server]/[guildId]/page.tsx'
const allianceRecordPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/alliance/[server]/[allianceId]/page.tsx'
const weeklyPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/weekly/[server]/[week]/page.tsx'
const rankingDataPath = 'src/lib/public-zvz-ranking-v2-data.ts'
const recordDataPath = 'src/lib/public-zvz-records.ts'

describe('public ZvZ board alliance-first source contracts', () => {
  it('renders tabs in the shared alliance-first order', () => {
    expect(source(boardPath)).toContain('PUBLIC_ZVZ_RANKING_ENTITY_KINDS.map')
  })

  it('keeps an explicit guild selection through board form submissions', () => {
    const board = source(boardPath)

    expect(board.match(/<input type="hidden" name="entity" value="guild" \/>/g)).toHaveLength(2)
    expect(board).not.toContain('<input type="hidden" name="entity" value="alliance" />')
  })

  it('returns entity-specific records to the matching board', () => {
    expect(source(guildRecordPath)).toContain("boardQuery.set('entity', 'guild')")
    expect(source(allianceRecordPath)).not.toContain("boardQuery.set('entity', 'alliance')")
    expect(source(weeklyPath)).toContain('boardHref={`${paths.zvzBattles}?entity=guild`}')
  })

  it('defaults to West and limits rankings to the selected server', () => {
    const board = source(boardPath)
    const rankingData = source(rankingDataPath)

    expect(board).toContain("normalizePublicZvzServerFilter(firstParam(params.server)) ?? 'west'")
    expect(board).toContain('const rankingServers = [server]')
    expect(board).not.toContain('SERVER_FILTERS.map')
    expect(board).toContain('<PublicZvzNavigationSelect')
    expect(board).toContain('rankings: rankings.filter((row) => row.server === rankingServer)')
    expect(board).toContain("t('serverRankingSectionTitle'")
    expect(rankingData).toContain(
      'rankings: selectPublicZvzRankingsPerServer(rankings, options.server, options.limit)',
    )
    expect(board).toContain('PUBLIC_ZVZ_RANKING_PAGE_SIZE')
    expect(board).toContain('PUBLIC_ZVZ_RANKING_MAX_RESULTS')
    expect(board).toContain('rankings: group.rankings.slice(rankingPageStart, rankingPageEnd)')
  })

  it('shows the exact low-sample boundary instead of hiding provisional ranks', () => {
    const board = source(boardPath)
    const rankingData = source(rankingDataPath)

    expect(board).toContain("row.sampleStatus === 'insufficient_sample'")
    expect(board).toContain('rankingLowConfidenceBoundary')
    expect(rankingData).toContain('const visibleRows = currentRows')
    expect(rankingData).not.toContain(
      "currentRows.filter((row) => row.sample_status === 'ranked')",
    )
  })

  it('shows the battle-time lead guild only on alliance ranking rows', () => {
    const board = source(boardPath)
    const rankingData = source(rankingDataPath)

    expect(board).toContain('row.representativeGuild ?')
    expect(board).toContain("t('representativeGuildLabel')")
    expect(board).toContain('row.representativeGuild.equivalentBattles')
    expect(board).toContain('row.representativeGuild.kills')
    expect(rankingData).toContain("options.entityKind === 'alliance'")
    expect(rankingData).toContain("db.rpc('get_public_zvz_v2_representative_guilds'")
  })

  it('gives first, second, and third place distinct podium surfaces', () => {
    const board = source(boardPath)

    expect(board).toContain('const PODIUM_TONES')
    expect(board).toContain('function podiumTone(rank: number)')
    expect(board).toContain('rank === 1 || rank === 2 || rank === 3')
    expect(board).toContain('const RankIcon = row.rank === 1 ? Trophy : Medal')
    expect(board).toContain('`mb-2 rounded-lg p-4 ${podium.card}`')
    expect(board).toContain("podium?.row ?? 'hover:bg-white/[0.03]'")
    expect(board).not.toContain('transition-all')
  })

  it('derives the season label and ranking window from configured season data', () => {
    const board = source(boardPath)

    expect(board).not.toContain('PUBLIC_ZVZ_FIRST_DATA_SEASON_START')
    expect(board).toContain('seasonDisplayName(primarySeasonSelection.season.name, t)')
    expect(board).toContain('primarySeasonSelection.season.startsAt')
    expect(board).toContain('primarySeasonSelection.season.endsOn')
    expect(board).toContain('primarySeasonSelection.snapshot.dataThroughAt')
    expect(board).not.toContain("t('seasonJudgementWindow'")
  })

  it('shows one compact season period in the board header', () => {
    const board = source(boardPath)

    expect(board).toContain("t('boardHeading'")
    expect(board.match(/primarySeasonSelection\.season\.startsAt/g)).toHaveLength(1)
    expect(board).not.toContain('seasonResult.selections.map')
    expect(board).toContain('primarySeasonSelection.season.startsAt')
    expect(board).toContain('primarySeasonSelection.snapshot.dataThroughAt')
  })

  it('keeps repeated methodology copy off data-first battle surfaces', () => {
    const board = source(boardPath)
    const guild = source(guildRecordPath)
    const alliance = source(allianceRecordPath)
    const battle = source(
      'src/app/(public-shell)/public/(marketing)/zvz-battles/battle/[server]/[battleId]/page.tsx',
    )

    expect(board).not.toContain("t('serverFilterHint')")
    expect(board).not.toContain("t('serverRankingSectionHint')")
    expect(board).not.toContain("t('divisionFilterHint')")
    expect(board).not.toContain("t('differentiatorBody')")
    expect(guild).not.toContain("t(season ? 'noPerBattleSeasonPointsNotice'")
    expect(alliance).not.toContain("t('participatingGuildsBody')")
    expect(battle).not.toContain("t('observedPerformanceBody')")
  })

  it('carries a selected size ranking into alliance evidence and lets users clear it', () => {
    const board = source(boardPath)
    const alliance = source(allianceRecordPath)
    const records = source(recordDataPath)

    expect(board).toContain("const scale = scope === 'overall' ? null : scope")
    expect(board).toContain('scale={scale}')
    expect(alliance).toContain('requestedScale')
    expect(alliance).toContain("boardQuery.set('division', selectedScale)")
    expect(alliance).toContain("t('clearScaleEvidenceFilter')")
    expect(records).toContain('filterPublicZvzScaleRankingEvidence(')
    expect(records).toContain('const rollup = scale ? record.rollups[scale] : record.rollups.overall')
  })

  it('separates rankings and battles without reducing the top-20 ranking', () => {
    const board = source(boardPath)

    expect(board).toContain('const RECENT_BATTLE_PREVIEW_COUNT = 3')
    expect(board).toContain("t('moreRecentBattles'")
    expect(board).toContain("normalizePublicZvzBoardView(firstParam(params.view))")
    expect(board).toContain("view === 'ranking' ?")
    expect(board).toContain('view="battles"')
    expect(board).not.toContain("t('rankingRowDetails')")
    expect(board).not.toContain("t('scoreBreakdownColumn')")
    expect(board).toContain('grid grid-cols-2 gap-1 sm:grid-cols-5')
    expect(board).not.toContain('min-w-[44rem]')
    expect(board).toContain('PUBLIC_ZVZ_RANKING_PAGE_SIZE')
  })
})
