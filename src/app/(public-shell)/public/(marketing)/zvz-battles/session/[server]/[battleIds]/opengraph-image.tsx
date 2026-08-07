import { ImageResponse } from 'next/og'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import { groupPublicZvzBattleSessions } from '@/lib/public-zvz-battle-sessions'
import { loadPublicBattlesByAlbionIds } from '@/lib/public-zvz-battles'
import { normalizePublicZvzBattleIds } from '@/lib/public-zvz-record-links'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AGM Battles grouped fight summary'
export const dynamic = 'force-dynamic'

export default async function BattleSessionOpenGraphImage({
  params,
}: {
  params: Promise<{ server: string; battleIds: string }>
}) {
  const route = await params
  const ids = normalizePublicZvzBattleIds(route.battleIds)
  const battles = isAlbionServer(route.server) && ids.length > 0
    ? await loadPublicBattlesByAlbionIds({ server: route.server, battleIds: ids }).catch(() => [])
    : []
  const session = groupPublicZvzBattleSessions(battles).find((candidate) => (
    candidate.battleIds.length === ids.length && ids.every((id) => candidate.battleIds.includes(id))
  ))
  const left = session?.topForces[0]
  const right = session?.topForces[1]
  const title = left && right ? `${left.forceName} vs ${right.forceName}` : 'Albion ZvZ fight'

  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 70, color: '#f8fafc', background: 'radial-gradient(circle at 12% 0%, rgba(56,189,248,.22), transparent 35%), radial-gradient(circle at 88% 100%, rgba(251,113,133,.2), transparent 34%), #080b10', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#fcd34d', fontSize: 30, fontWeight: 900 }}><span style={{ display: 'flex', width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14, background: 'rgba(251,191,36,.14)', border: '2px solid rgba(251,191,36,.4)' }}>A</span>AGM Battles</div>
        <div style={{ fontSize: 22, color: '#cbd5e1' }}>{route.server.toUpperCase()} · ACTUAL FIGHT</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 62, lineHeight: 1.05, letterSpacing: -2, fontWeight: 900 }}>{title}</div>
        <div style={{ display: 'flex', gap: 20, marginTop: 28, fontSize: 28, color: '#d8dee9' }}>
          <span>{session?.battleCount ?? ids.length} logs</span><span style={{ color: '#64748b' }}>•</span><span>{session?.durationMinutes ?? 0} min</span><span style={{ color: '#64748b' }}>•</span><span>{session?.peakPlayers ?? 0} peak players</span>
        </div>
        {left && right ? <div style={{ display: 'flex', gap: 28, marginTop: 26, fontSize: 30, fontWeight: 900 }}><span style={{ color: '#bae6fd' }}>{left.kills}K–{left.deaths}D</span><span style={{ color: '#64748b' }}>VS</span><span style={{ color: '#fecdd3' }}>{right.kills}K–{right.deaths}D</span></div> : null}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: '#94a3b8' }}><span>One fight · every source log</span><span>albion-guildmanager.com</span></div>
    </div>,
    size,
  )
}
