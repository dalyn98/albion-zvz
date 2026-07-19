const EVENT_LIVE_WINDOW_MS = 60 * 60 * 1000

export interface EventStateSnapshot {
  fingerprint: string
  battle_started_at: string | null
  gather_at: string | null
}

export function eventStateFingerprint(revision: unknown): string | null {
  if (typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 0) {
    return String(revision)
  }
  if (typeof revision === 'string' && /^\d+$/.test(revision)) return revision
  return null
}

export function parseEventStateSnapshot(value: unknown): EventStateSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.fingerprint !== 'string' || !row.fingerprint) return null
  return {
    fingerprint: row.fingerprint,
    battle_started_at:
      typeof row.battle_started_at === 'string' ? row.battle_started_at : null,
    gather_at: typeof row.gather_at === 'string' ? row.gather_at : null,
  }
}

export function shouldPollEventSnapshot(
  snapshot: EventStateSnapshot,
  nowMs = Date.now(),
): boolean {
  if (!snapshot.battle_started_at) return true
  const startedAt = Date.parse(snapshot.battle_started_at)
  if (!Number.isFinite(startedAt)) return true
  return nowMs - startedAt < EVENT_LIVE_WINDOW_MS
}

export function didEventSnapshotChange(
  previousFingerprint: string | null,
  nextFingerprint: string,
): boolean {
  // Without a server-established baseline, the first client read must refresh:
  // state may have changed between the rendered queries and hydration.
  return previousFingerprint === null || previousFingerprint !== nextFingerprint
}

export type EventSnapshotPollAction = 'continue' | 'refresh' | 'stop'

const MAX_EVENT_SNAPSHOT_RETRY_DELAY_MS = 10 * 60_000

interface ResolveEventSnapshotPollActionInput {
  responseStatus: number
  confirmedFingerprint: string | null
  nextFingerprint?: unknown
  shouldPoll?: unknown
}

export function resolveEventSnapshotPollAction(
  input: ResolveEventSnapshotPollActionInput,
): EventSnapshotPollAction {
  if (input.responseStatus === 404) return 'refresh'
  if (input.responseStatus < 200 || input.responseStatus >= 300) return 'continue'
  if (typeof input.nextFingerprint !== 'string' || !input.nextFingerprint) return 'continue'
  if (didEventSnapshotChange(input.confirmedFingerprint, input.nextFingerprint)) return 'refresh'
  return input.shouldPoll === false ? 'stop' : 'continue'
}

export function resolveEventSnapshotPollDelayMs(input: {
  responseStatus: number
  retryAfter: string | null
  intervalMs: number
  now?: number
}): number {
  if (input.responseStatus !== 429 || !input.retryAfter) return input.intervalMs

  const seconds = Number(input.retryAfter)
  const retryAfterMs = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(input.retryAfter) - (input.now ?? Date.now())
  if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return input.intervalMs

  return Math.min(
    MAX_EVENT_SNAPSHOT_RETRY_DELAY_MS,
    Math.max(input.intervalMs, Math.ceil(retryAfterMs)),
  )
}
