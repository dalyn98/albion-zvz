const EVENT_LIVE_WINDOW_MS = 60 * 60 * 1000

export interface EventStateSnapshot {
  fingerprint: string
  battle_started_at: string | null
  gather_at: string | null
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
