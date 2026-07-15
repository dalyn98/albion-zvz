// Keep the baseline CSP intentionally narrow: document-level protections do not
// require nonces and do not interfere with Next.js scripts, styles, YouTube
// embeds, Sentry, or Supabase-hosted images.
export const HTTP_SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
] as const
