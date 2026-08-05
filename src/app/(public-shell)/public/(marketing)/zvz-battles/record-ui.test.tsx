import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  PublicZvzBattleMatchupCard,
  PublicZvzCollapsibleGuildList,
  PublicZvzDeferredGuildList,
  PublicZvzKdScore,
  PublicZvzPrimaryScaleBadge,
  shouldCollapsePublicZvzGuildSection,
} from './record-ui'

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
        engagementScale="mid"
        engagementScaleText="Mid · 21–40 players"
        scaleRankingEligible={false}
        labels={{
          included: 'Included',
          engagementScale: 'Engagement scale',
          scaleRankingIncluded: 'Included in size ranking',
          scaleRankingExcluded: 'Overall only · Size mismatch',
          scaleRankingHint: 'Smaller side must be at least 75% of the larger side.',
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
    expect(html).toContain('K / D: 7 – 11')
    expect(html).toContain('K / D: 28 – 14')
    expect(html).toContain('text-emerald-200')
    expect(html).toContain('text-rose-200')
    expect(html).toContain('Battle #497216166')
    expect(html).toContain('Engagement scale')
    expect(html).toContain('Mid · 21–40 players')
    expect(html).toContain('Overall only · Size mismatch')
    expect(html).toContain('Smaller side must be at least 75%')
    expect(html).not.toContain('Unknown region')
    expect(html).not.toContain('qualification')
  })

  it('keeps smaller participating guilds available in a native disclosure', () => {
    const html = renderToStaticMarkup(
      <PublicZvzDeferredGuildList summary="2 guilds under 20 more">
        <span>IS DOG 1</span>
        <span>Ally 1</span>
      </PublicZvzDeferredGuildList>,
    )

    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('2 guilds under 20 more')
    expect(html).toContain('IS DOG 1')
    expect(html).not.toContain('<details open')
  })

  it('promotes an alliance-wide team size above its combat metrics', () => {
    const html = renderToStaticMarkup(
      <PublicZvzBattleMatchupCard
        startedAt="2026-08-03T13:26:00.000Z"
        locale="ko"
        subjectName="YAHO"
        subjectLabel="이 연합"
        teamSize={73}
        kills={21}
        deaths={14}
        killFame={8_000_000}
        opponents={[]}
        basePath="/ko/zvz-battles"
        server="east"
        weekStart="2026-08-03"
        prominentTeamSize={{
          label: '연합 총 인원',
          value: '73명',
          hint: '이 교전에서 관측된 연합 전체 인원입니다.',
        }}
        labels={{
          included: '순위 반영',
          engagementScale: '교전 규모',
          scaleRankingIncluded: '규모별 반영',
          scaleRankingExcluded: '전체만 반영',
          scaleRankingHint: '비슷한 규모만 반영됩니다.',
          battleId: 'Battle #1',
          totalPlayers: '양측 합산 100명',
          versus: 'VS',
          opponents: '주요 상대 세력',
          opponentCount: '0개',
          force: '인원',
          kd: 'K / D',
          killFame: '킬페임',
          noOpponents: '상대 정보 없음',
        }}
      />,
    )

    expect(html).toContain('연합 총 인원')
    expect(html).toContain('73명')
    expect(html).toContain('이 교전에서 관측된 연합 전체 인원입니다.')
    expect(html).toContain('text-3xl')
    expect(html).toContain('grid-cols-[1.5fr_0.75fr]')
  })

  it('collapses the whole guild section only after four guilds', () => {
    expect(shouldCollapsePublicZvzGuildSection(4)).toBe(false)
    expect(shouldCollapsePublicZvzGuildSection(5)).toBe(true)

    const html = renderToStaticMarkup(
      <PublicZvzCollapsibleGuildList
        title="Leading guilds"
        countLabel="5 guilds"
      >
        <span>BFID</span>
        <span>BABY</span>
      </PublicZvzCollapsibleGuildList>,
    )

    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('Leading guilds')
    expect(html).toContain('5 guilds')
    expect(html).not.toContain('<details open')
    expect(html).toContain('group-open:rotate-180')
  })

  it('distinguishes a confirmed primary scale from a pending one', () => {
    const html = renderToStaticMarkup(
      <>
        <PublicZvzPrimaryScaleBadge
          scale="zerg"
          scaleLabel="Zerg"
          prefix="Primary"
          pendingLabel="Primary · Pending"
          hint="Two or more official engagements"
        />
        <PublicZvzPrimaryScaleBadge
          scale={null}
          prefix="Primary"
          pendingLabel="Primary · Pending"
        />
      </>,
    )

    expect(html).toContain('Primary · Zerg')
    expect(html).toContain('Primary · Pending')
    expect(html).toContain('title="Two or more official engagements"')
  })

  it('renders kills and deaths as one accessible, high-contrast score', () => {
    const html = renderToStaticMarkup(
      <PublicZvzKdScore
        kills={1_234}
        deaths={56}
        label="K / D"
        size="lg"
      />,
    )

    expect(html).toContain('K / D: 1,234 – 56')
    expect(html).toContain('tabular-nums')
    expect(html).toContain('text-emerald-200')
    expect(html).toContain('text-rose-200')
    expect(html).toContain('>K</span>')
    expect(html).toContain('>D</span>')
  })
})
