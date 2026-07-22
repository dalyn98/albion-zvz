type PreviewFields = Readonly<Record<string, string>>

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function createPreviewSnapshot(fields: PreviewFields): string {
  return stableSerialize(fields)
}

export function isPreviewSnapshotCurrent(
  snapshot: string | null,
  fields: PreviewFields,
): boolean {
  return snapshot !== null && snapshot === createPreviewSnapshot(fields)
}

export function reconcileSelectionWithVisible(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const visible = new Set(visibleIds)
  return new Set([...selected].filter((id) => visible.has(id)))
}
