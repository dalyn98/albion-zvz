import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import createMDX from '@next/mdx'
// TEMP DISABLED (hotfix/sentry-disable): withSentryConfig wrapper 가 미들웨어 번들에
// @swc/helpers/esm/_interop_require_default 동적 require 를 주입 → Vercel NFT 가
// 추적 못해 MIDDLEWARE_INVOCATION_FAILED. apex 500 복구 위해 한시 제거.
// 복구되면 원본 wrapper 로 되돌릴 것 — @sentry/nextjs 다운그레이드 또는 SDK 패치 후.
// import { withSentryConfig } from '@sentry/nextjs'

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
  // Next.js 16 의 @vercel/nft 파일 트레이싱이 컴파일 산출물의
  // `@swc/helpers/esm/_interop_require_default` require 를 추적 못해 Vercel
  // serverless 함수 번들에서 누락되는 이슈 — 모든 라우트에 @swc/helpers 강제 포함.
  outputFileTracingIncludes: {
    '/*': ['node_modules/@swc/helpers/**/*'],
  },
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
    // 미매칭 URL 진입 시 RootLayout 의 `locked` 분기가 AppGate(로그인 화면)
    // 를 강제로 띄우는 것을 우회 — `src/app/global-not-found.tsx` 가 layout
    // 우회 채널로 직접 렌더된다. segment-level notFound() 호출은 여전히
    // `src/app/not-found.tsx` 가 처리.
    globalNotFound: true,
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
  // 인덱싱 정책 (robots.txt + meta robots 와 3중 신호):
  //   - 마케팅/공개 path (/, /landing, /faq, /docs, /g/*) 와 그 직접 형식
  //     (/public/*) 은 검색 인덱싱 허용
  //   - 그 외 모든 path 는 noindex (앱 path /admin /shop /events /api 등)
  //
  // Next.js 의 header override 규칙 — 같은 path 에 같은 key 가 여러 번 매칭되면
  // **마지막** 규칙이 이긴다. 따라서 wildcard noindex 를 먼저 두고, 마케팅 path
  // 별 indexable 규칙을 뒤에 두면 충돌 없이 정확히 분기된다.
  // 호스트 단위 분기는 generateMetadata 가 robots meta 로 한 번 더 덮어 쓰므로
  // (테넌트 서브도메인은 결국 noindex 로 모인다), 여기서는 path 만 본다.
  async headers() {
    const indexHeader = {
      key: 'X-Robots-Tag',
      value: 'index, follow',
    }
    const noindexHeader = {
      key: 'X-Robots-Tag',
      value: 'noindex, nofollow, noarchive, nosnippet, notranslate, noimageindex',
    }
    return [
      // 1) 기본값 — 모든 path 차단
      { source: '/:path*', headers: [noindexHeader] },
      // 2) 마케팅/공개 surface — 인덱싱 허용 (위 wildcard 를 override)
      { source: '/', headers: [indexHeader] },
      { source: '/landing', headers: [indexHeader] },
      { source: '/faq', headers: [indexHeader] },
      { source: '/docs', headers: [indexHeader] },
      { source: '/docs/:path*', headers: [indexHeader] },
      { source: '/g/:slug', headers: [indexHeader] },
      { source: '/public/landing', headers: [indexHeader] },
      { source: '/public/faq', headers: [indexHeader] },
      { source: '/public/docs', headers: [indexHeader] },
      { source: '/public/docs/:path*', headers: [indexHeader] },
      { source: '/public/g/:slug', headers: [indexHeader] },
    ]
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const withMDX = createMDX({})

// TEMP DISABLED (hotfix/sentry-disable): 위 import 주석 참조. 원본 wrapper 는 아래.
// export default withSentryConfig(withNextIntl(withMDX(nextConfig)), {
//   org: process.env.SENTRY_ORG,
//   project: process.env.SENTRY_PROJECT,
//   silent: !process.env.CI,
//   authToken: process.env.SENTRY_AUTH_TOKEN,
//   tunnelRoute: '/monitoring',
//   webpack: { automaticVercelMonitors: false },
// })
export default withNextIntl(withMDX(nextConfig))
