export interface LogContinuityResult {
  lastKnownLoggedAt: string | null
  lastKnownLabel: string | null
  lastKnownInBatch: boolean
  newEntriesAfterLast: number
  gapFromLastKnownMs: number | null
}

interface SummarizeLogContinuityOptions<T> {
  allEntries: readonly T[]
  newEntries: readonly T[]
  latestStoredEntries: readonly T[]
  getLoggedAt: (entry: T) => Date
  getKey: (entry: T) => string
  getLabel: (entry: T) => string
}

export function summarizeLogContinuity<T>(
  options: SummarizeLogContinuityOptions<T>,
): LogContinuityResult {
  const latest = options.latestStoredEntries[0]
  if (!latest) {
    return {
      lastKnownLoggedAt: null,
      lastKnownLabel: null,
      lastKnownInBatch: false,
      newEntriesAfterLast: options.newEntries.length,
      gapFromLastKnownMs: null,
    }
  }

  const latestMs = options.getLoggedAt(latest).getTime()
  const batchKeys = new Set(options.allEntries.map(options.getKey))
  const lastKnownInBatch = options.latestStoredEntries.some((entry) =>
    batchKeys.has(options.getKey(entry)),
  )
  const newEntriesAfterLast = options.newEntries.filter(
    (entry) => options.getLoggedAt(entry).getTime() >= latestMs,
  ).length

  let gapFromLastKnownMs: number | null = null
  if (!lastKnownInBatch) {
    const afterLatest = options.newEntries.filter(
      (entry) => options.getLoggedAt(entry).getTime() > latestMs,
    )
    if (afterLatest.length > 0) {
      const earliestAfter = Math.min(
        ...afterLatest.map((entry) => options.getLoggedAt(entry).getTime()),
      )
      gapFromLastKnownMs = earliestAfter - latestMs
    }
  }

  return {
    lastKnownLoggedAt: options.getLoggedAt(latest).toISOString(),
    lastKnownLabel: options.getLabel(latest),
    lastKnownInBatch,
    newEntriesAfterLast,
    gapFromLastKnownMs,
  }
}
