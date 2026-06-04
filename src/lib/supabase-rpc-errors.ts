export interface SupabaseRpcErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export function isMissingRpcError(
  error: SupabaseRpcErrorLike | null | undefined,
  rpcName: string,
): boolean {
  if (!error) return false
  if (error.code === 'PGRST202' || error.code === '42883') return true

  const haystack = [
    error.message,
    error.details,
    error.hint,
  ]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase()

  const name = rpcName.toLowerCase()
  return (
    haystack.includes(name) &&
    (
      haystack.includes('not found') ||
      haystack.includes('could not find') ||
      haystack.includes('does not exist') ||
      haystack.includes('undefined function')
    )
  )
}
