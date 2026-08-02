import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8')
}

describe('navigation and rendering performance policy', () => {
  it('prefetches large secondary routes only after navigation intent', () => {
    const source = read('src/components/AppSidebar.tsx')
    const navLink = source.slice(source.indexOf('function NavLink'), source.indexOf('function NavGroup'))

    expect(source).toContain('function IntentPrefetchLink')
    expect(navLink).toContain('<IntentPrefetchLink')
  })

  it('reserves space for remote notice images before they load', () => {
    const systemNotice = read('src/components/SystemNoticesBanner.tsx')
    const systemNoticeClient = read('src/components/SystemNoticeBannerClient.tsx')
    const tenantNotice = read('src/components/DismissibleNoticeBanner.tsx')

    expect(systemNotice).toContain('<SystemNoticeBannerClient')
    expect(systemNoticeClient).toContain('h-32')
    expect(systemNoticeClient).toContain('width={512}')
    expect(systemNoticeClient).toContain('height={128}')
    expect(tenantNotice).toContain('aspect-[16/5]')
    expect(tenantNotice).toContain('object-contain')
  })

  it('loads only above-the-fold marketing carousel images eagerly', () => {
    const carousel = read('src/components/MarketingScreenshotCarousel.tsx')
    const featurePage = read(
      'src/app/(public-shell)/public/(marketing)/features/[slug]/page.tsx',
    )

    expect(carousel).toContain(
      "loading={priorityFirstImage && idx === 0 ? 'eager' : 'lazy'}",
    )
    expect(carousel).not.toContain('priority={priorityFirstImage')
    expect(featurePage).toContain('priorityFirstImage')
  })
})
