export function PublicZvzEntityOgContent({
  kind,
  name,
  server,
  rank,
  engagements,
  kills,
  deaths,
  scale,
}: {
  kind: 'GUILD' | 'ALLIANCE'
  name: string
  server: string
  rank: number | null
  engagements: number
  kills: number
  deaths: number
  scale: string
}) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 70, color: '#f8fafc', background: 'radial-gradient(circle at 12% 0%, rgba(251,191,36,.24), transparent 36%), linear-gradient(135deg,#070a0f,#101722 58%,#1d1308)', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#fcd34d', fontSize: 30, fontWeight: 900 }}><span style={{ display: 'flex', width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14, background: 'rgba(251,191,36,.14)', border: '2px solid rgba(251,191,36,.4)' }}>A</span>AGM Battles</div>
        <div style={{ fontSize: 22, color: '#cbd5e1' }}>{server.toUpperCase()} · {kind}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          {rank ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 100, height: 70, borderRadius: 35, background: 'rgba(251,191,36,.16)', border: '2px solid rgba(251,191,36,.34)', color: '#fde68a', fontSize: 36, fontWeight: 900 }}>#{rank}</span> : null}
          <span style={{ fontSize: 62, lineHeight: 1.05, letterSpacing: -2, fontWeight: 900 }}>{name}</span>
        </div>
        <div style={{ display: 'flex', gap: 26, marginTop: 30, fontSize: 28, color: '#d8dee9' }}>
          <span>{scale}</span><span style={{ color: '#64748b' }}>•</span><span>{engagements} fights</span><span style={{ color: '#64748b' }}>•</span><span style={{ color: '#a7f3d0', fontWeight: 900 }}>{kills}K</span><span style={{ color: '#fecdd3', fontWeight: 900 }}>{deaths}D</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: '#94a3b8' }}><span>Season ranking · battle record</span><span>albion-guildmanager.com</span></div>
    </div>
  )
}
