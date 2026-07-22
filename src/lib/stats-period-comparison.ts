export interface PointFlowComparisonRow {
  delta: number
  createdAt: string
}

export interface PointFlowPeriodSummary {
  earned: number
  spent: number
  net: number
}

export interface PeriodChange {
  absolute: number
  percent: number | null
}

export function calculatePeriodChange(current: number, previous: number): PeriodChange {
  const absolute = current - previous
  if (previous === 0) return { absolute, percent: null }
  return {
    absolute,
    percent: Math.round((absolute / Math.abs(previous)) * 1000) / 10,
  }
}

export function summarizePointFlowPeriods(
  rows: PointFlowComparisonRow[],
  currentPeriodStartIso: string,
): { current: PointFlowPeriodSummary; previous: PointFlowPeriodSummary } {
  const currentPeriodStart = Date.parse(currentPeriodStartIso)
  const current = emptySummary()
  const previous = emptySummary()

  for (const row of rows) {
    const createdAt = Date.parse(row.createdAt)
    const delta = Number(row.delta)
    if (!Number.isFinite(createdAt) || !Number.isFinite(delta) || delta === 0) continue
    const summary = createdAt >= currentPeriodStart ? current : previous
    if (delta > 0) summary.earned += delta
    else summary.spent += -delta
  }

  current.net = current.earned - current.spent
  previous.net = previous.earned - previous.spent
  return { current, previous }
}

function emptySummary(): PointFlowPeriodSummary {
  return { earned: 0, spent: 0, net: 0 }
}
