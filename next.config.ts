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

const swcTracingIncludes = ['./node_modules/@swc/helpers/**/*']
const killbotCardTracingIncludes = [
  './public/killbot/Arimo.ttf',
]

const nextConfig: NextConfig = {
  // MDX 페이지 (`/docs/*` 의 page.mdx) 를 라우트로 인식시킨다. .md 는 사용 안
  // 함 — 모든 docs 본문은 .mdx 로 통일.
  pageExtensions: ['ts', 'tsx', 'mdx'],
  // Next.js 16 + Turbopack + Vercel NFT 결함:
  //   컴파일 산출물이 `@swc/helpers/esm/_interop_require_default.js` 직접경로 require.
  //   설치된 0.5.21 의 `exports` 필드는 modern path (`./_/_interop_require_default`)
  //   만 노출하고 직접 `./esm/*` 은 `./esm/*` 패스스루만 매핑돼 NFT 가 정적 추적
  //   실패 → /var/task 누락 → MIDDLEWARE_INVOCATION_FAILED.
  //
  // 핵심 픽스 (package.json 동행):
  //   @swc/helpers 를 next 16.2.6 이 선언한 0.5.15 로 강제 다운그레이드.
  //   0.5.15 는 exports 필드가 단순해 NFT 가 모든 헬퍼 파일을 정상 트레이스.
  //
  // 보강: outputFileTracingIncludes 로 @swc/helpers 전체 트리 강제 포함 (belt-and-suspenders).
  // serverExternalPackages 는 제거 — 외부 require 유지하면 여전히 /var/task 의존,
  // 디폴트(번들 inline) 로 두면 헬퍼 파일이 함수 번들에 직접 박힌다.
  outputFileTracingIncludes: {
    '/': swcTracingIncludes,
    '/(.*)': swcTracingIncludes,
    // Killbot cards are rendered inside serverless functions with sharp's Pango
    // text layer. Vercel NFT can miss the font when it is only referenced as a
    // runtime fontfile path, which turns all card text into tofu boxes in Discord.
    '/api/cron/killbot-feed': [...swcTracingIncludes, ...killbotCardTracingIncludes],
    '/api/discord/interactions': [...swcTracingIncludes, ...killbotCardTracingIncludes],
    '/admin/dashboard/killbot': [...swcTracingIncludes, ...killbotCardTracingIncludes],
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
      // Discord 사용자 아바타. 사이드바/멤버 페이지에서 next/image 로 로드.
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
        pathname: '/avatars/**',
      },
      // Supabase storage — 마케팅 캐러셀(`MarketingScreenshotCarousel`) 의
      // 스크린샷/길드 프로필 배너/갤러리 호스트. 프로젝트 ref 는 env 별로
      // 다르므로 와일드카드.
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // 마케팅 legacy path 는 canonical root 로 모으고, 통합된 랜딩에 흡수된 기능
  // 페이지의 인바운드 링크는 anchor 로 308 redirect. 정적 redirect 는 Next.js
  // 라우팅 이전에 fire 되므로 anchor 가 그대로 Location 헤더에 실린다. 봇 초대
  // 단축 URL(`/invite`) 은 Discord OAuth scope/permissions drift 를 막기 위해
  // route handler 에서 공용 URL 생성 함수를 사용한다.
  async redirects() {
    return [
      { source: '/landing', destination: '/', permanent: true },
    ]
  },
  // 인덱싱 정책 (robots.txt + meta robots 와 3중 신호):
  //   - 마케팅/공개 path (/, /pricing, /faq, /privacy, /terms, /docs, /g/*, /demo)
  //     와 그 직접 형식 (/public/*) 은 검색 인덱싱 허용. `/demo/*` 상세 미리보기는
  //     렌더링은 허용하되 sitemap/meta 정책과 맞춰 noindex 로 둔다.
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
    const publicMarketingCacheHeader = {
      key: 'Cache-Control',
      value: 'public, s-maxage=3600, stale-while-revalidate=86400',
    }
    const cachedIndexHeaders = [indexHeader, publicMarketingCacheHeader]
    return [
      // 1) 기본값 — 모든 path 차단
      { source: '/:path*', headers: [noindexHeader] },
      // robots/sitemap 자체에 nofollow 를 붙이지 않는다. URL 목록은 페이지
      // 인덱싱 정책과 별개로 크롤러가 따라갈 수 있어야 한다.
      { source: '/robots.txt', headers: [indexHeader] },
      { source: '/sitemap.xml', headers: [indexHeader] },
      // 2) 마케팅/공개 surface — 인덱싱 허용 (위 wildcard 를 override)
      { source: '/', headers: cachedIndexHeaders },
      { source: '/features', headers: cachedIndexHeaders },
      { source: '/features/:path*', headers: cachedIndexHeaders },
      { source: '/:locale(ko|ja|en|zh)/features', headers: cachedIndexHeaders },
      { source: '/:locale(ko|ja|en|zh)/features/:path*', headers: cachedIndexHeaders },
      { source: '/pricing', headers: cachedIndexHeaders },
      { source: '/faq', headers: cachedIndexHeaders },
      { source: '/privacy', headers: cachedIndexHeaders },
      { source: '/terms', headers: cachedIndexHeaders },
      { source: '/docs', headers: cachedIndexHeaders },
      { source: '/docs/:path*', headers: cachedIndexHeaders },
      { source: '/g/:slug', headers: [indexHeader] },
      { source: '/demo', headers: [indexHeader] },
      { source: '/public/landing', headers: cachedIndexHeaders },
      { source: '/public/features', headers: cachedIndexHeaders },
      { source: '/public/features/:path*', headers: cachedIndexHeaders },
      { source: '/public/pricing', headers: cachedIndexHeaders },
      { source: '/public/faq', headers: cachedIndexHeaders },
      { source: '/public/privacy', headers: cachedIndexHeaders },
      { source: '/public/terms', headers: cachedIndexHeaders },
      { source: '/public/docs', headers: cachedIndexHeaders },
      { source: '/public/docs/:path*', headers: cachedIndexHeaders },
      { source: '/public/g/:slug', headers: [indexHeader] },
    ]
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')
const withMDX = createMDX({})

// Sentry 는 배포 시 source map 업로드 (SENTRY_AUTH_TOKEN 있을 때만), 클라이언트
// 번들에 SDK 주입 등을 webpack/turbopack 단계에서 처리한다. silent=true 면
// 로컬 빌드에서 토큰 없을 때 경고가 줄어든다.
//
// 참고: 28761cc 에서 한시 비활성했었지만 apex 500 은 그대로 였음 → Sentry 가
// 원인이 아님 확정, 정상 복구.
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
