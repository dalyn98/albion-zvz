import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Menhera — Albion ZvZ',
    short_name: 'Menhera',
    description: 'Albion Online 대규모 PvP 관리 도구',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f1117',
    theme_color: '#0f1117',
    lang: 'ko',
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon1', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
