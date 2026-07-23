import {
  MAX_INTERNAL_RETURN_TO_LENGTH,
  sanitizeInternalReturnTo,
} from '@/lib/safe-return-to'

const MAX_QUERY_KEY_LENGTH = 64
const MAX_QUERY_VALUE_LENGTH = 512
const AUTH_ERROR_PATTERN = /^[a-z0-9_]{1,64}$/
const SENSITIVE_QUERY_KEYS = new Set([
  'access_token',
  'auth_error',
  'code',
  'error',
  'error_description',
  'id_token',
  'install_error',
  'oauth_token',
  'refresh_token',
  'returnto',
  'retry',
  'state',
  'token',
])

type SearchEntries = Iterable<readonly [string, string]>

function isSafeNavigationParameter(key: string, value: string): boolean {
  const normalizedKey = key.trim().toLowerCase()
  if (!normalizedKey || normalizedKey.length > MAX_QUERY_KEY_LENGTH) return false
  if (SENSITIVE_QUERY_KEYS.has(normalizedKey)) return false
  if (value.length > MAX_QUERY_VALUE_LENGTH) return false
  return true
}

export function buildReturnToWithSearchParams(
  pathname: string,
  searchParams: SearchEntries,
): string {
  const safePathname = sanitizeInternalReturnTo(pathname)
  const output = new URLSearchParams()

  for (const [key, value] of searchParams) {
    if (!isSafeNavigationParameter(key, value)) continue
    const candidate = new URLSearchParams(output)
    candidate.append(key, value)
    const candidatePath = `${safePathname}?${candidate.toString()}`
    if (candidatePath.length > MAX_INTERNAL_RETURN_TO_LENGTH) continue
    output.append(key, value)
  }

  const query = output.toString()
  return query ? `${safePathname}?${query}` : safePathname
}

export function buildLoginEntryHref(options: {
  returnTo: string
  authError?: string | null
  forceConsent?: boolean
}): string {
  const params = new URLSearchParams({
    returnTo: sanitizeInternalReturnTo(options.returnTo),
  })
  const authError = options.authError?.trim()
  if (authError && AUTH_ERROR_PATTERN.test(authError)) {
    params.set('auth_error', authError)
  }
  if (options.forceConsent) params.set('retry', '1')
  return `/login?${params.toString()}`
}

export function resolveCurrentPageLoginReturnTo(
  pathname: string,
  searchParams: SearchEntries,
): string {
  const entries = [...searchParams]
  if (pathname === '/guild-login') {
    const localReturnTo = entries.find(([key]) => key === 'return')?.[1]
    return sanitizeInternalReturnTo(localReturnTo)
  }
  return buildReturnToWithSearchParams(pathname || '/', entries)
}
