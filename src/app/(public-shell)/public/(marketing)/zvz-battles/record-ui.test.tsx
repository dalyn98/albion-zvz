import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PublicZvzBattleMatchupCard } from './record-ui'

describe('PublicZvzBattleMatchupCard', () => {
  it('renders an explicit side-by-side matchup without region filler', () => {
    const html = renderToStaticMarkup(
      <PublicZvzBattleMatchupCard
        startedAt="2026-08-03T13:26:00.000Z"
        locale="ko"
        subjectName="Menhera"
        subjectLabel="This guild"
        teamSize={20}
        kills={7}
        deaths={11}
        killFame={4_000_000}
        opponents={[
          {
            forceKey: 'alliance:bfid',
            forceKind: 'alliance',
            forceName: 'BFID',
            allianceAlbionId: 'bfid-id',
            guildAlbionId: null,
            teamSize: 31,
            kills: 28,
            deaths: 14,
            killFame: 9_500_000,
            hasScoreEvidence: true,
          },
          {
            forceKey: 'guild:baby',
            forceKind: 'guild',
            forceName: 'BABY',
            allianceAlbionId: null,
            guildAlbionId: null,
            teamSize: 24,
            kills: 1,
            deaths: 24,
            killFame: 500_000,
            hasScoreEvidence: false,
          },
        ]}
        basePath="/ko/zvz-battles"
        server="east"
        weekStart="2026-08-03"
        labels={{
          included: 'Included',
          battleId: 'Battle #497216166',
          totalPlayers: '100 total players',
          versus: 'VS',
          opponents: 'Main opposing forces',
          opponentCount: '2 forces',
          force: 'Players',
          kd: 'K / D',
          killFame: 'Kill fame',
          noOpponents: 'No opposing force details are available.',
        }}
      />,
    )

    expect(html).toContain('Menhera')
    expect(html).toContain('BFID')
    expect(html).toContain('BABY')
    expect(html).toContain('7 / 11')
    expect(html).toContain('28 / 14')
    expect(html).toContain('Battle #497216166')
    expect(html).not.toContain('Unknown region')
    expect(html).not.toContain('qualification')
  })
})
