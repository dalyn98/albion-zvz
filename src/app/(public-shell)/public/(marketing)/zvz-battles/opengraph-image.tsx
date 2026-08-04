import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AGM Battles — Albion Online ZvZ performance board'
export const dynamic = 'force-dynamic'

export default function AgmBattlesOpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 70, color: '#f8fafc', background: 'radial-gradient(circle at 20% 5%, rgba(251,191,36,.26), transparent 35%), linear-gradient(135deg,#070a0f,#101722 55%,#25140d)', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}><div style={{ display: 'flex', width: 68, height: 68, borderRadius: 18, alignItems: 'center', justifyContent: 'center', background: 'rgba(251,191,36,.14)', border: '2px solid rgba(251,191,36,.45)', color: '#fcd34d', fontSize: 38, fontWeight: 900 }}>A</div><div style={{ fontSize: 34, color: '#fcd34d', fontWeight: 900 }}>AGM Battles</div></div>
      <div style={{ display: 'flex', flexDirection: 'column' }}><div style={{ fontSize: 66, lineHeight: 1.04, letterSpacing: -2, fontWeight: 900, maxWidth: 980 }}>Not a kill log.<br />A public ZvZ performance board.</div><div style={{ marginTop: 28, fontSize: 25, color: '#a7b0bf' }}>20 v 20 qualification · real engagement splits · guild & alliance evidence</div></div>
      <div style={{ display: 'flex', gap: 18, fontSize: 20, color: '#d7dde7' }}><span>West</span><span style={{ color: '#64748b' }}>•</span><span>Europe</span><span style={{ color: '#64748b' }}>•</span><span>East</span><span style={{ marginLeft: 'auto', color: '#94a3b8' }}>albion-guildmanager.com</span></div>
    </div>,
    size,
  )
}
