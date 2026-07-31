export const EVENT_OPERATIONAL_DURATION_MS = 60 * 60 * 1000

export interface EventOperationalBoundary {
  battle_started_at?: string | null
  operational_ended_at?: string | null
}

export function resolveManualOperationalStartIso(input: {
  gatherAt: string | null | undefined
  nowMs?: number
}): string {
  const nowMs = input.nowMs ?? Date.now()
  const gatherMs = input.gatherAt ? Date.parse(input.gatherAt) : Number.NaN
  return new Date(Number.isFinite(gatherMs) && gatherMs <= nowMs ? gatherMs : nowMs)
    .toISOString()
}

export function resolveOperationalEndIso(
  event: EventOperationalBoundary,
): string | null {
  if (event.operational_ended_at) {
    const explicitEnd = Date.parse(event.operational_ended_at)
    if (Number.isFinite(explicitEnd)) return new Date(explicitEnd).toISOString()
  }
  if (!event.battle_started_at) return null
  const startedAt = Date.parse(event.battle_started_at)
  if (!Number.isFinite(startedAt)) return null
  return new Date(startedAt + EVENT_OPERATIONAL_DURATION_MS).toISOString()
}

export function isOperationallyEnded(
  event: EventOperationalBoundary,
  nowMs: number = Date.now(),
): boolean {
  const endIso = resolveOperationalEndIso(event)
  return endIso !== null && Date.parse(endIso) <= nowMs
}
