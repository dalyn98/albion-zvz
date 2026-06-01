export type FilterOrderDirection = 'earlier' | 'later'

export function orderedFilterValues<T extends string>(
  defaultOrder: readonly T[],
  storedOrder: readonly string[] | null | undefined,
): T[] {
  const validValues = new Set<string>(defaultOrder)
  const seen = new Set<T>()
  const ordered: T[] = []

  for (const rawValue of storedOrder ?? []) {
    if (!validValues.has(rawValue)) continue
    const value = rawValue as T
    if (seen.has(value)) continue
    ordered.push(value)
    seen.add(value)
  }

  for (const value of defaultOrder) {
    if (!seen.has(value)) ordered.push(value)
  }

  return ordered
}

export function moveFilterValue<T extends string>(
  order: readonly T[],
  value: T,
  direction: FilterOrderDirection,
): T[] {
  const index = order.indexOf(value)
  if (index < 0) return [...order]

  const targetIndex = direction === 'earlier' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= order.length) return [...order]

  const next = [...order]
  const target = next[targetIndex]
  next[targetIndex] = value
  next[index] = target
  return next
}
