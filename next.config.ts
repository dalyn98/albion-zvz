import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import createMDX from '@next/mdx'
import { withSentryConfig } from '@sentry/nextjs'

// Server Actions compare the incoming `origin` header against the request host
// to block CSRF. When the site is reached via a Tailscale IP (100.x.x.x) or any
// non-loopback LAN address, that mismatch aborts the action. List those
// origins here so mobile clients on the tailnet can submit forms.
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  // MDX 페이지 (`/docs/*` 의 page.mdx) 를 라우트로 인식시킨다. .md 는 사용 안
  // 함 — 모든 docs 본문은 .mdx 로 통일.
  pageExtensions: ['ts', 'tsx', 'mdx'],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '100.83.248.83:3000',
        'albion-guildmanager.com',
        '*.albion-guildmanager.com',
        ...extraOrigins,
      ],
      // 기본 1MB 은 스크린샷(리기어/기부/배너)에 너무 작다. 앱 레벨 상한
      // (10MB) 과 Supabase bucket 제한(10MB) 에 맞춰 10MB 로 확장 — 이보다
      // 큰 파일은 서버 액션의 깔끔한 'screenshotTooLarge' 메시지로 거절된다.
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'render.albiononline.com',
        pathname: '/v1/item/**',
      },
    ],
  },
  // 짧고 외우기 쉬운 봇 초대 URL + 통합된 /landing 으로 흡수된 마케팅 페이지의
  // 인바운드 링크를 anchor 로 308 redirect. 정적 redirect 는 Next.js 라우팅
  // 이전에 fire 되므로 anchor 가 그대로 Location 헤더에 실린다.
  async redirects() {
    return [
      {
        source: '/invite',
        destination:
          'https://discord.com/oauth2/authorize?client_id=1495149595238469742&permissions=201346048&response_type=code&redirect_uri=https%3A%2F%2Falbion-guildmanager.com%2Fapi%2Fauth%2Fdiscord%2Fbot-callback&integration_type=0&scope=bot',
        permanent: false,
      },
      { source: '/features', destination: '/#features', permanent: true },
      { source: '/pricing', destination: '/#pricing', permanent: true },
      { source: '/public/features', destination: '/public/landing#features', permanent: true },
      { source: '/public/pricing', destination: '/public/landing#pricing', permanent: true },
    ]
  },
  // 전역 noindex/nofollow. robots.txt 와 이중 신호 — 일부 봇은 meta/header 만
  // 본다. multi-tenant SaaS 로 확장 시 marketing 도메인만 인덱싱 허용하고
  // 이 길드 인스턴스는 계속 차단 유지하는 전제.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet, notranslate, noimageindex',
          },
        ],
      },
    ]
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const withMDX = createMDX({})

// Sentry 는 배포 시 source map 업로드 (SENTRY_AUTH_TOKEN 있을 때만), 클라이언트
// 번들에 SDK 주입 등을 webpack/turbopack 단계에서 처리한다. silent=true 면
// 로컬 빌드에서 토큰 없을 때 경고가 줄어든다.
export default withSentryConfig(withNextIntl(withMDX(nextConfig)), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  // 토큰 없으면 source map 업로드 자동 skip — DSN 이 비어 있어도 빌드는 통과.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // 클라이언트 번들에 ad-blocker 가 보내는 요청을 막지 않도록 tunnel route 활성.
  // 실제 효과는 NEXT_PUBLIC_SENTRY_DSN 이 set 됐을 때만 발생.
  tunnelRoute: '/monitoring',
  // 빌드 시 Vercel 의 Cron Monitor 자동 연동을 끈다 — 우리는 자체 vercel.json
  // cron 을 쓰고, Sentry Cron 은 별도 기능 (선택 도입).
  webpack: {
    automaticVercelMonitors: false,
  },
})
