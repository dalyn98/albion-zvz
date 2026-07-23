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

  root.style.overflow = 'hidden'
  root.style.overscrollBehavior = 'none'

  // iOS Safari에서는 overflow:hidden만으로 배경의 rubber-band 스크롤이
  // 계속될 수 있다. 현재 좌표에서 body를 고정해 viewport를 실제로 동결한다.
  body.style.overflow = 'hidden'
  body.style.position = 'fixed'
  body.style.top = `-${scrollY}px`
  body.style.left = `-${scrollX}px`
  body.style.right = '0'
  body.style.width = '100%'

  return () => {
    Object.assign(body.style, previousBodyStyle)
    Object.assign(root.style, previousRootStyle)
    window.scrollTo(scrollX, scrollY)
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
