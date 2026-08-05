import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

const boardPath = 'src/app/(public-shell)/public/(marketing)/zvz-battles/page.tsx'
const recordUiPath = 'src/app/(public-shell)/public/(marketing)/zvz-battles/record-ui.tsx'
const guildRecordPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/guild/[server]/[guildId]/page.tsx'
const allianceRecordPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/alliance/[server]/[allianceId]/page.tsx'
const weeklyPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/weekly/[server]/[week]/page.tsx'
const battleReportPath =
  'src/app/(public-shell)/public/(marketing)/zvz-battles/battle/[server]/[battleId]/page.tsx'
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

  it('does not present unavailable region data as a battle headline', () => {
    for (const path of [boardPath, guildRecordPath, allianceRecordPath]) {
      expect(source(path)).not.toContain('clusterName')
      expect(source(path)).not.toContain('unknownCluster')
    }
  })

  it('keeps internal qualification versions out of the evidence card', () => {
    expect(source(guildRecordPath)).not.toContain('qualificationNotice')
    expect(source(guildRecordPath)).not.toContain('qualificationVersion')
  })

  it('defers sub-20 guilds while keeping them available from battle records', () => {
    for (const path of [boardPath, allianceRecordPath]) {
      const page = source(path)
      expect(page).toContain('OFFICIAL_ZVZ_MIN_SIDE_SIZE')
      expect(page).toContain('<PublicZvzDeferredGuildList')
      expect(page).toContain('smallerGuildsMore')
    }
  })

  it('collapses the entire guild section when a battle contains more than four guilds', () => {
    for (const path of [boardPath, allianceRecordPath]) {
      const page = source(path)
      expect(page).toContain('shouldCollapsePublicZvzGuildSection')
      expect(page).toContain('<PublicZvzCollapsibleGuildList')
      expect(page).toContain("searchGuildCount")
    }
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
