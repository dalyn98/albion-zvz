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

  it('renders and limits rankings independently for every server', () => {
    const board = source(boardPath)
    const rankingData = source(rankingDataPath)

    expect(board).toContain('const rankingServers = server ? [server] : PUBLIC_ZVZ_RANKING_SERVERS')
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
    expect(board).toContain("podium?.card ?? 'bg-[#0b0f16]/90")
    expect(board).toContain("podium?.row ?? 'hover:bg-white/[0.03]'")
    expect(board).not.toContain('transition-all')
  })

  it('derives the season label and ranking window from configured season data', () => {
    const board = source(boardPath)

    expect(board).not.toContain('PUBLIC_ZVZ_FIRST_DATA_SEASON_START')
    expect(board).toContain('seasonDisplayName(selection.season.name, t)')
    expect(board).toContain('selection.season.startsOn')
    expect(board).toContain('selection.snapshot.dataThroughAt')
    expect(board).toContain("'snapshotProvisionalShort'")
    expect(board).not.toContain("t('seasonJudgementWindow'")
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
})
