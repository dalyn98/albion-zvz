import { detectInAppBrowser } from './user-agent'

type LockedBodyStyle = Pick<
  CSSStyleDeclaration,
  'left' | 'overflow' | 'position' | 'right' | 'top' | 'width'
>

type LockedRootStyle = Pick<CSSStyleDeclaration, 'overflow' | 'overscrollBehavior'>

let activeLockCount = 0
let restoreFirstLock: (() => void) | null = null

function snapshotBodyStyle(style: CSSStyleDeclaration): LockedBodyStyle {
  return {
    left: style.left,
    overflow: style.overflow,
    position: style.position,
    right: style.right,
    top: style.top,
    width: style.width,
  }
}

function snapshotRootStyle(style: CSSStyleDeclaration): LockedRootStyle {
  return {
    overflow: style.overflow,
    overscrollBehavior: style.overscrollBehavior,
  }
}

function applyFirstLock(): () => void {
  const body = document.body
  const root = document.documentElement
  const previousBodyStyle = snapshotBodyStyle(body.style)
  const previousRootStyle = snapshotRootStyle(root.style)
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  const isInAppBrowser = detectInAppBrowser(window.navigator?.userAgent) !== null

  root.style.overflow = 'hidden'
  root.style.overscrollBehavior = 'none'

  // iOS Safari에서는 overflow:hidden만으로 배경의 rubber-band 스크롤이
  // 계속될 수 있어 body 고정이 필요하다. 반면 Google 앱 같은 WebView에서
  // body:fixed는 full-screen dialog의 자체 스크롤까지 막을 수 있다. 인앱
  // 브라우저는 overflow 잠금만으로 배경 스크롤이 차단되므로 고정을 피한다.
  body.style.overflow = 'hidden'
  if (!isInAppBrowser) {
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = `-${scrollX}px`
    body.style.right = '0'
    body.style.width = '100%'
  }

  return () => {
    Object.assign(body.style, previousBodyStyle)
    Object.assign(root.style, previousRootStyle)
    if (!isInAppBrowser) {
      window.scrollTo(scrollX, scrollY)
    }
  }
}

/**
 * Locks background scrolling until the returned cleanup is called.
 *
 * Every caller owns one lock. Overlapping drawers/dialogs therefore cannot
 * accidentally restore the page while another overlay is still open.
 */
export function acquireBodyScrollLock(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => undefined
  }

  if (activeLockCount === 0) {
    restoreFirstLock = applyFirstLock()
  }
  activeLockCount += 1

  let released = false
  return () => {
    if (released) return
    released = true
    activeLockCount = Math.max(0, activeLockCount - 1)

    if (activeLockCount !== 0) return
    const restore = restoreFirstLock
    restoreFirstLock = null
    restore?.()
  }
}
