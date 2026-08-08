import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const boardPath = 'src/app/(public-shell)/public/(marketing)/zvz-battles/page.tsx'
const sessionCardPath = 'src/components/PublicZvzBattleSessionCard.tsx'
const recordUiPath = 'src/app/(public-shell)/public/(marketing)/zvz-battles/record-ui.tsx'
const guildRecordPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/guild/[server]/[guildId]/page.tsx'
const allianceRecordPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/alliance/[server]/[allianceId]/page.tsx'
const weeklyPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/weekly/[server]/[week]/page.tsx'
const battleReportPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/battle/[server]/[battleId]/page.tsx'
const battleSessionPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/session/[server]/[battleIds]/page.tsx'
const battleExplorerPath = 'src/components/PublicBattleReportExplorer.tsx'
const battleOpenGraphPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/battle/[server]/[battleId]/opengraph-image.tsx'

describe('public ZvZ battle card source contracts', () => {
  it('uses the shared matchup card for guild and alliance evidence', () => {
    expect(source(guildRecordPath)).toContain('<PublicZvzBattleMatchupCard')
    expect(source(allianceRecordPath)).toContain('<PublicZvzBattleMatchupCard')
  })

  it('promotes the authoritative alliance-wide force on alliance battle cards only', () => {
    const allianceRecord = source(allianceRecordPath)
    const guildRecord = source(guildRecordPath)

    expect(allianceRecord).toContain('prominentTeamSize={{')
    expect(allianceRecord).toContain("label: t('allianceTotalPlayersMetric')")
    expect(allianceRecord).toContain("value: t('peopleCount', { count: battle.teamSize })")
    expect(guildRecord).not.toContain('prominentTeamSize={{')
  })

  it('compares the featured force and opponents with the same metrics', () => {
    const recordUi = source(recordUiPath)

    expect(recordUi).toContain('subjectName')
    expect(recordUi).toContain('labels.opponents')
    expect(recordUi.match(/label=\{labels\.force\}/g)).toHaveLength(2)
    expect(recordUi.match(/<PublicZvzKdScore/g)).toHaveLength(2)
    expect(recordUi.match(/label=\{labels\.kd\}/g)).toHaveLength(4)
    expect(recordUi.match(/label=\{labels\.killFame\}/g)).toHaveLength(2)
  })

  it('uses the shared high-contrast K-D score on every AGM Battles surface', () => {
    for (const path of [
      boardPath,
      guildRecordPath,
      allianceRecordPath,
      weeklyPath,
      battleReportPath,
    ]) {
      expect(source(path)).toContain('PublicZvzKdScore')
    }

    const recordUi = source(recordUiPath)
    expect(recordUi).toContain('text-emerald-200')
    expect(recordUi).toContain('text-rose-200')
    expect(recordUi).toContain('tabular-nums')

    const openGraph = source(battleOpenGraphPath)
    expect(openGraph).toContain("color: '#a7f3d0'")
    expect(openGraph).toContain("color: '#fecdd3'")
    expect(openGraph).toContain('first.homeKills')
    expect(openGraph).toContain('first.homeDeaths')
  })

  it('renders recent battles as a balanced two-sided matchup', () => {
    const board = source(boardPath)
    const sessionCard = source(sessionCardPath)

    expect(board).toContain('<PublicZvzBattleSessionCard')
    expect(sessionCard).toContain('function MatchupSide')
    expect(sessionCard).toContain('<MatchupSide force={primary} labels={labels} />')
    expect(sessionCard).toContain('<MatchupSide force={secondary} right labels={labels} />')
    expect(sessionCard).toContain('labels.additionalForces')
  })

  it('does not present unavailable region data as a battle headline', () => {
    for (const path of [boardPath, guildRecordPath, allianceRecordPath]) {
      expect(source(path)).not.toContain('clusterName')
      expect(source(path)).not.toContain('unknownCluster')
    }
  })

  it('keeps internal scoring and qualification versions off public pages', () => {
    const guild = source(guildRecordPath)
    const alliance = source(allianceRecordPath)
    const report = source(battleReportPath)

    expect(guild).not.toContain('qualificationNotice')
    expect(guild).not.toContain('hint: record.scoreBreakdown.formulaVersion')
    expect(alliance).not.toContain('hint: record.scoreBreakdown?.formulaVersion')
    expect(report).not.toContain("t('qualificationVersion'")
  })

  it('does not render unavailable region data on the battle report', () => {
    const report = source(battleReportPath)

    expect(report).not.toContain('MapPin')
    expect(report).not.toContain("t('locationUnknown')")
  })

  it('streams the detailed public session analyzer and keeps its long sections tabbed', () => {
    const session = source(battleSessionPath)
    const explorer = source(battleExplorerPath)

    expect(session).toContain('loadPublicZvzBattleSessionReport')
    expect(session).toContain('loadPublicBattleGroupAnalysis')
    expect(session).toContain('<Suspense')
    expect(session).toContain('<PublicBattleReportExplorer')
    expect(explorer).toContain("useState<ReportTab>('matchup')")
    expect(explorer).toContain('aria-selected={activeTab === id}')
    expect(explorer.match(/hidden=\{activeTab !==/g)).toHaveLength(6)
  })

  it('keeps unavailable region data out of the detailed session analyzer', () => {
    const detailSource = `${source(battleSessionPath)}\n${source(battleExplorerPath)}`

    expect(detailSource).not.toMatch(/clusterName|unknownCluster|locationUnknown/)
  })

  it('keeps developer vocabulary and redundant official labels out of public copy', () => {
    for (const locale of ['ko', 'ja', 'en', 'zh']) {
      const messages = JSON.parse(source(`src/messages/${locale}.json`)) as {
        publicZvzBattles: Record<string, string>
        publicZvzRecords: Record<string, string>
      }
      const publicCopy = [
        ...Object.values(messages.publicZvzBattles),
        ...Object.values(messages.publicZvzRecords),
      ].join(' ')
      const statusLabels = [
        messages.publicZvzBattles.activityViewOfficial,
        messages.publicZvzBattles.agmZvzBadge,
        messages.publicZvzRecords.officialBattleBadge,
      ].join(' ')

      expect(publicCopy).not.toMatch(
        /agm_zvz|P90|cron|\/battles|snapshot|스냅샷|スナップショット|快照/i,
      )
      expect(statusLabels).not.toMatch(/official|공식|公式|正式|官方/i)
    }
  })

  it('defers sub-20 guilds while keeping them available from battle records', () => {
    const sessionCard = source(sessionCardPath)
    expect(sessionCard).toContain('session.isOfficialZvz ? 20 : 10')
    expect(sessionCard).toContain('otherGuilds')
    expect(sessionCard).toContain('<details')
    expect(source(allianceRecordPath)).toContain('<PublicZvzDeferredGuildList')
  })

  it('keeps long participating-guild sections collapsed', () => {
    const sessionCard = source(sessionCardPath)
    expect(sessionCard).toContain('<details')
    expect(sessionCard).toContain('<summary')
    expect(sessionCard).toContain('majorGuilds.length + otherGuilds.length')
    const allianceRecord = source(allianceRecordPath)
    expect(allianceRecord).toContain('shouldCollapsePublicZvzGuildSection')
    expect(allianceRecord).toContain('<PublicZvzCollapsibleGuildList')
  })

  it('shows the actual scale on every ranked engagement card', () => {
    for (const path of [guildRecordPath, allianceRecordPath]) {
      const page = source(path)
      expect(page).toContain('engagementScale={battle.engagementScale}')
      expect(page).toContain('divisionRange_${battle.engagementScale}')
      expect(page).toContain('engagementScaleLabel')
    }
  })
})
