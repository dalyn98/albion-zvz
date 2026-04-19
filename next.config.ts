import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// Server Actions compare the incoming `origin` header against the request host
// to block CSRF. When the site is reached via a Tailscale IP (100.x.x.x) or any
// non-loopback LAN address, that mismatch aborts the action. List those
// origins here so mobile clients on the tailnet can submit forms.
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', '100.83.248.83:3000', ...extraOrigins],
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
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
