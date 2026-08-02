import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SystemNoticeBannerClient from '@/components/SystemNoticeBannerClient'

describe('SystemNoticeBannerClient', () => {
  it('lets users dismiss important notices', () => {
    const html = renderToStaticMarkup(
      <SystemNoticeBannerClient
        id="notice-important"
        message="Important maintenance"
        imageUrl={null}
        severity="important"
        dismissLabel="Dismiss notice"
      />,
    )

    expect(html).toContain('data-system-notice-severity="important"')
    expect(html).toContain('aria-label="Dismiss notice"')
  })

  it('keeps critical notices non-dismissible', () => {
    const html = renderToStaticMarkup(
      <SystemNoticeBannerClient
        id="notice-critical"
        message="Critical incident"
        imageUrl={null}
        severity="critical"
        dismissLabel="Dismiss notice"
      />,
    )

    expect(html).toContain('data-system-notice-severity="critical"')
    expect(html).not.toContain('aria-label="Dismiss notice"')
  })
})
