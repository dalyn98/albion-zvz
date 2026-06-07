interface SupabaseErrorLike {
  code?: unknown
  message?: unknown
  details?: unknown
  hint?: unknown
}

export class SupabaseQueryError extends Error {
  readonly code: string | null

  constructor(label: string, error: unknown) {
    const code = getSupabaseErrorCode(error)
    const message = getSupabaseErrorMessage(error)
    super(`${label}${code ? ` (${code})` : ''}: ${message}`)
    this.name = 'SupabaseQueryError'
    this.code = code
  }
}

export function getSupabaseErrorCode(error: unknown): string | null {
  if (!isSupabaseErrorLike(error)) return null
  return typeof error.code === 'string' && error.code.trim()
    ? error.code.trim()
    : null
}

export function getSupabaseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (isSupabaseErrorLike(error) && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'Unknown Supabase query error'
}

export function publicSupabaseFailureMessage(error: unknown): string {
  const code = getSupabaseErrorCode(error)
  const message = getSupabaseErrorMessage(error)
  if (code === 'PGRST002' || /schema cache/i.test(message)) {
    return 'Supabase schema cache is unavailable'
  }
  if (/timeout|timed out/i.test(message)) return 'Supabase request timed out'
  if (/fetch failed|network|connection/i.test(message)) return 'Supabase request failed'
  return 'Supabase query failed'
}

function isSupabaseErrorLike(error: unknown): error is SupabaseErrorLike {
  return typeof error === 'object' && error !== null
}
