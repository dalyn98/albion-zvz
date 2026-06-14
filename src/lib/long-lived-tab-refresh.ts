export const DEFAULT_LONG_LIVED_TAB_REFRESH_MS = 30 * 60 * 1000
export const ASSET_RELOAD_THROTTLE_MS = 60 * 1000

const ASSET_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /CSS_CHUNK_LOAD_FAILED/i,
]

export function shouldRefreshLongLivedTab(
  lastRefreshAt: number,
  now: number,
  thresholdMs = DEFAULT_LONG_LIVED_TAB_REFRESH_MS,
): boolean {
  return now - lastRefreshAt >= thresholdMs
}

export function isAssetLoadError(error: unknown): boolean {
  const text = errorToText(error)
  if (!text) return false
  return ASSET_ERROR_PATTERNS.some((pattern) => pattern.test(text))
}

export function shouldReloadForAssetError(input: {
  error: unknown
  lastReloadAt: number
  now: number
  throttleMs?: number
}): boolean {
  if (!isAssetLoadError(input.error)) return false
  return input.now - input.lastReloadAt >= (input.throttleMs ?? ASSET_RELOAD_THROTTLE_MS)
}

function errorToText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : ''
    const message = typeof record.message === 'string' ? record.message : ''
    return `${name}: ${message}`.trim()
  }
  return ''
}
