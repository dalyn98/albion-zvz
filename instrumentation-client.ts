// Next.js 16 client instrumentation. Keep this file intentionally tiny:
// it runs before hydration, so importing the browser Sentry SDK here adds
// Sentry's client runtime to every first page load. Server/edge Sentry remains
// enabled via sentry.server.config.ts and sentry.edge.config.ts.

type NavigationType = 'push' | 'replace' | 'traverse'

export function onRouterTransitionStart(
  url: string,
  navigationType: NavigationType,
): void {
  void url
  void navigationType
  // Browser-side Sentry navigation tracing is disabled to keep initial JS small.
}
