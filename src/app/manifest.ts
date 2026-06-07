import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { classifyHost } from '@/lib/tenant-resolver'
import { displayNameFromSlug } from '@/lib/tenant-slug'

const PRODUCT_NAME = 'Albion ZvZ'

// PWA manifest 는 host 별로 다른 brand name 을 노출. iOS "홈 화면에 추가" 의
// 아이콘 라벨이 host 의 길드명으로 떠야 — 멘헤라/Jelda/...
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const headersList = await headers()
  const classification = classifyHost(headersList.get('host'))
  const tenantName =
    classification.kind === 'tenant'
      ? displayNameFromSlug(classification.slug) || PRODUCT_NAME
      : PRODUCT_NAME
  const fullName = tenantName === PRODUCT_NAME ? PRODUCT_NAME : `${tenantName} — ${PRODUCT_NAME}`
  return {
    name: fullName,
    short_name: tenantName,
    description: 'Albion Online ZvZ guild management tools',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f1117',
    theme_color: '#0f1117',
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon1.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
