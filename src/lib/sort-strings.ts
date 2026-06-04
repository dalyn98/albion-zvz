// Hydration-safe string comparator.
//
// `String.prototype.localeCompare()` without an explicit locale uses the
// runtime's default — env-driven on Node, navigator.language on browsers.
// Vercel runs en_US while users' browsers may be ko/ja/en/zh, so the same
// `username.localeCompare(...)` returns different results on the server
// (during SSR) and the client (during hydration), tripping React #418.
//
// Pin to a single stable locale on both sides. 'en' is arbitrary — what
// matters is that server and client agree.
const COLLATOR = new Intl.Collator('en')

export function compareStrings(a: string, b: string): number {
  return COLLATOR.compare(a, b)
}

export function compareIsoStringsDesc(a: string, b: string): number {
  if (a === b) return 0
  return a < b ? 1 : -1
}
