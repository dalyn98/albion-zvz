export function resolveSentryTraceSampleRate(
  rawValue: string | undefined,
  fallback: number,
): number {
  if (rawValue === undefined || rawValue.trim() === '') return fallback
  const value = Number(rawValue)
  if (!Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}
