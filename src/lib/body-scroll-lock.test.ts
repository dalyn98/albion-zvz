import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeStyle {
  overflow: string
  overscrollBehavior: string
  position: string
  top: string
  left: string
  right: string
  width: string
}

function createStyle(overrides: Partial<FakeStyle> = {}): FakeStyle {
  return {
    overflow: '',
    overscrollBehavior: '',
    position: '',
    top: '',
    left: '',
    right: '',
    width: '',
    ...overrides,
  }
}

function installDom({
  scrollX = 0,
  scrollY = 0,
  userAgent = 'Mozilla/5.0 Safari/605.1.15',
  bodyStyle = createStyle(),
  rootStyle = createStyle(),
}: {
  scrollX?: number
  scrollY?: number
  userAgent?: string
  bodyStyle?: FakeStyle
  rootStyle?: FakeStyle
} = {}) {
  const scrollTo = vi.fn()

  vi.stubGlobal('document', {
    body: { style: bodyStyle },
    documentElement: { style: rootStyle },
  })
  vi.stubGlobal('window', { scrollX, scrollY, scrollTo, navigator: { userAgent } })

  return { bodyStyle, rootStyle, scrollTo }
}

describe('body scroll lock', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('freezes the mobile page and restores its exact scroll position', async () => {
    const bodyStyle = createStyle({ overflow: 'auto', width: 'calc(100% - 1rem)' })
    const rootStyle = createStyle({ overscrollBehavior: 'contain' })
    const dom = installDom({ scrollX: 12, scrollY: 480, bodyStyle, rootStyle })
    const { acquireBodyScrollLock } = await import('./body-scroll-lock')

    const release = acquireBodyScrollLock()

    expect(bodyStyle).toMatchObject({
      overflow: 'hidden',
      position: 'fixed',
      top: '-480px',
      left: '-12px',
      right: '0',
      width: '100%',
    })
    expect(rootStyle).toMatchObject({
      overflow: 'hidden',
      overscrollBehavior: 'none',
    })

    release()

    expect(bodyStyle).toEqual(createStyle({
      overflow: 'auto',
      width: 'calc(100% - 1rem)',
    }))
    expect(rootStyle).toEqual(createStyle({ overscrollBehavior: 'contain' }))
    expect(dom.scrollTo).toHaveBeenCalledOnce()
    expect(dom.scrollTo).toHaveBeenCalledWith(12, 480)
  })

  it('keeps the page locked until every overlapping modal releases its lock', async () => {
    const dom = installDom({ scrollY: 240 })
    const { acquireBodyScrollLock } = await import('./body-scroll-lock')

    const releaseDrawer = acquireBodyScrollLock()
    const releaseDialog = acquireBodyScrollLock()

    releaseDrawer()
    expect(dom.bodyStyle.position).toBe('fixed')
    expect(dom.rootStyle.overflow).toBe('hidden')
    expect(dom.scrollTo).not.toHaveBeenCalled()

    releaseDialog()
    expect(dom.bodyStyle.position).toBe('')
    expect(dom.rootStyle.overflow).toBe('')
    expect(dom.scrollTo).toHaveBeenCalledOnce()
  })

  it('avoids fixed-body locking in the Google app WebView', async () => {
    const dom = installDom({
      scrollY: 320,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 GSA/378.0 Mobile/15E148 Safari/604.1',
    })
    const { acquireBodyScrollLock } = await import('./body-scroll-lock')

    const release = acquireBodyScrollLock()

    expect(dom.bodyStyle.overflow).toBe('hidden')
    expect(dom.rootStyle.overflow).toBe('hidden')
    expect(dom.bodyStyle.position).toBe('')
    expect(dom.bodyStyle.top).toBe('')

    release()

    expect(dom.bodyStyle.overflow).toBe('')
    expect(dom.rootStyle.overflow).toBe('')
    expect(dom.scrollTo).not.toHaveBeenCalled()
  })

  it('makes each release idempotent so a stale cleanup cannot unlock another modal', async () => {
    const dom = installDom()
    const { acquireBodyScrollLock } = await import('./body-scroll-lock')

    const releaseFirst = acquireBodyScrollLock()
    releaseFirst()
    releaseFirst()

    const releaseSecond = acquireBodyScrollLock()
    expect(dom.bodyStyle.overflow).toBe('hidden')
    releaseSecond()

    expect(dom.bodyStyle.overflow).toBe('')
    expect(dom.scrollTo).toHaveBeenCalledTimes(2)
  })
})
