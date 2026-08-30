// Next.js 16 client instrumentation. Observability clients are intentionally
// disabled after the project entered regear-only maintenance mode.

type NavigationType = 'push' | 'replace' | 'traverse'

export function onRouterTransitionStart(
  url: string,
  navigationType: NavigationType,
): void {
  void url
  void navigationType
  // Navigation tracing is disabled.
}
