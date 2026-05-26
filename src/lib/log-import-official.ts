import { filterByLogOperatingStart } from '@/lib/log-operating-start'

export interface OfficialLogEntries<T> {
  entries: T[]
  skippedBeforeStart: number
  operatingStartAt: string | null
}

export function selectOfficialLogEntries<T>(
  entries: readonly T[],
  getLoggedAt: (entry: T) => Date,
  operatingStart: Date | null,
): OfficialLogEntries<T> {
  const official = filterByLogOperatingStart(entries, getLoggedAt, operatingStart)
  return {
    ...official,
    operatingStartAt: operatingStart?.toISOString() ?? null,
  }
}

