import { ImageResponse } from 'next/og'

// Default 1200x630 OG image used when sharing canonical marketing pages on
// Discord/Slack/Twitter. Per-page generateMetadata can override
// `openGraph.images` with a route-specific banner (e.g. each guild's profile
// uses its own banner image).
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AlbionGuildManager'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(135deg, #0f1117 0%, #1a1f2e 55%, #2d1810 100%)',
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
          padding: 80,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -160,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 720,
            height: 720,
            borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(245,158,11,0.35), transparent 70%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            marginBottom: 40,
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 100,
              height: 100,
              borderRadius: 24,
              background: 'rgba(245,158,11,0.15)',
              border: '2px solid rgba(245,158,11,0.4)',
              color: '#f59e0b',
              fontSize: 64,
              fontWeight: 900,
            }}
          >
            A
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              letterSpacing: -1,
              color: '#f59e0b',
            }}
          >
            AlbionGuildManager
          </div>
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: '#f8fafc',
            textAlign: 'center',
            lineHeight: 1.25,
            zIndex: 1,
            maxWidth: 900,
          }}
        >
          Albion Online guild operations on autopilot
        </div>
        <div
          style={{
            display: 'flex',
            gap: 28,
            marginTop: 36,
            fontSize: 22,
            color: '#94a3b8',
            zIndex: 1,
          }}
        >
          <span>Killboard</span>
          <span>·</span>
          <span>Auto-regear</span>
          <span>·</span>
          <span>Guild shop</span>
          <span>·</span>
          <span>Stats</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
