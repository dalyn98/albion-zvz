const DEFAULT_SENSITIVE_KEYS = new Set([
  'access_token',
  'authorization',
  'client_secret',
  'code',
  'id_token',
  'invite',
  'password',
  'refresh_token',
  'secret',
  'state',
  'token',
])

export function redactSearchParams(
  params: URLSearchParams,
  sensitiveKeys: ReadonlySet<string> = DEFAULT_SENSITIVE_KEYS,
): string {
  const redacted = new URLSearchParams()
  for (const [key, value] of params.entries()) {
    const normalizedKey = key.toLowerCase()
    redacted.append(
      key,
      sensitiveKeys.has(normalizedKey) ? '[redacted]' : redactNestedSearchValue(value),
    )
  }
  return redacted.toString()
}

function redactNestedSearchValue(value: string): string {
  if (!value.includes('?')) return value
  return redactUrlSearch(value)
}

export function redactUrlSearch(value: string): string {
  if (!value.includes('?')) return value
  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(value)
    const url = new URL(value, 'https://albion-guildmanager.local')
    url.search = redactSearchParams(url.searchParams)
    if (isAbsolute) return url.toString()
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return value
  }
}
