import { ImageResponse } from 'next/og'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import { loadPublicZvzBattleReport } from '@/lib/public-zvz-battle-report'
import { normalizePublicZvzBattleId } from '@/lib/public-zvz-record-links'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AGM Battles public battle report'
export const dynamic = 'force-dynamic'

export default async function BattleReportOpenGraphImage({
  params,
}: {
  params: Promise<{ server: string; battleId: string }>
}) {
  const route = await params
  const battleId = normalizePublicZvzBattleId(route.battleId)
  const data = battleId && isAlbionServer(route.server)
    ? await loadPublicZvzBattleReport(route.server, battleId).catch(() => null)
    : null
  const first = data?.engagements.find((engagement) => engagement.status === 'final')
  const opponent = first?.matchups.find((matchup) => matchup.role === 'result_eligible')
  const title = first && opponent
    ? `${first.homeForceName} vs ${opponent.opponentName}`
    : `Battle #${battleId ?? route.battleId}`
  const details = first
    ? `${first.homeSideTeamSize} vs ${first.opponentSideTeamSize}`
    : `${route.server.toUpperCase()} · public Albion battle data`

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 70, color: '#f8fafc', background: 'radial-gradient(circle at 15% 0%, rgba(251,191,36,.25), transparent 34%), linear-gradient(135deg,#070a0f,#111827 58%,#29130e)', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#fcd34d', fontSize: 30, fontWeight: 900 }}><span style={{ display: 'flex', width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14, background: 'rgba(251,191,36,.14)', border: '2px solid rgba(251,191,36,.4)' }}>A</span>AGM Battles</div><div style={{ fontSize: 22, color: data?.isOfficial ? '#86efac' : '#cbd5e1' }}>{data?.isOfficial ? 'OFFICIAL AGM ZvZ' : 'PUBLIC BATTLE REPORT'}</div></div>
      <div style={{ display: 'flex', flexDirection: 'column' }}><div style={{ fontSize: 27, fontWeight: 800, color: '#94a3b8' }}>{route.server.toUpperCase()} · Battle #{battleId ?? route.battleId}</div><div style={{ marginTop: 18, fontSize: 62, lineHeight: 1.07, letterSpacing: -2, fontWeight: 900, maxWidth: 1060 }}>{title}</div><div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 24, fontSize: 30, color: '#d8dee9' }}><span>{details}</span>{first ? <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 16px', borderRadius: 12, background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', fontWeight: 900 }}><span style={{ color: '#a7f3d0' }}>{first.homeKills} K</span><span style={{ color: '#64748b' }}>–</span><span style={{ color: '#fecdd3' }}>{first.homeDeaths} D</span></span> : null}</div></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: '#94a3b8' }}><span>Observed performance · no invented winner</span><span>albion-guildmanager.com</span></div>
    </div>,
    size,
  )
}
