import { ImageResponse } from 'next/og'
import { headers } from 'next/headers'
import { classifyHost, resolveTenantBySlug } from '@/lib/tenant-resolver'
import { getAppSetting } from '@/lib/app-settings'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { proxyOgBannerImage } from '@/lib/og-banner-proxy'

// Default 1200x630 OG image used when sharing canonical marketing pages on
// Discord/Slack/Twitter. Per-page generateMetadata can override
// `openGraph.images` with a route-specific banner (e.g. each guild's profile
// uses its own banner image).
//
// 테넌트 서브도메인 ({slug}.albion-guildmanager.com) 에서는 layout 의
// metadataBase 가 그쪽 호스트로 잡혀 og:image URL 도 같은 서브도메인으로
// 만들어진다. 그래서 여기 핸들러가 헤더에서 host 를 읽어 그 길드의
// landing_banner_url 을 그대로 스트림할지, JSX OG 카드를 렌더할지 분기한다.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AlbionGuildManager'

// 매번 새로 평가해야 host 단위로 다른 이미지를 돌려줄 수 있다 — 정적 캐시는
// 한 번 만들어진 이미지를 모든 호스트에서 공유해버린다.
export const dynamic = 'force-dynamic'

export default async function OpengraphImage() {
  const headersList = await headers()
  const classification = classifyHost(headersList.get('host'))

  if (classification.kind === 'tenant') {
    const tenant = await resolveTenantBySlug(classification.slug)
    if (tenant) {
      const bannerUrl = (
        await getAppSetting('landing_banner_url', '', tenant.tenantId)
      ).trim()
      if (bannerUrl) {
        const proxied = await proxyOgBannerImage(bannerUrl)
        if (proxied) return proxied
      }
      return renderCard({
        brand: displayNameFromSlug(tenant.slug) || tenant.name,
        tagline: 'Albion Online guild operations on autopilot',
      })
    }
  }

  return renderCard({
    brand: 'AlbionGuildManager',
    tagline: 'Albion Online guild operations on autopilot',
  })
}

interface CardProps {
  brand: string
  tagline: string
}

function renderCard({ brand, tagline }: CardProps): ImageResponse {
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
            {brand.charAt(0).toUpperCase()}
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              letterSpacing: -1,
              color: '#f59e0b',
            }}
          >
            {brand}
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
          {tagline}
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
