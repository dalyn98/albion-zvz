export type FilterOrderDirection = 'earlier' | 'later'

export interface FilterHrefItem {
  value: string
  href: string
}

export function parseStoredFilterOrder(storedValue: string | null | undefined): string[] | null {
  if (!storedValue) return null

  const candidates = [storedValue]
  try {
    const decoded = decodeURIComponent(storedValue)
    if (decoded !== storedValue) candidates.unshift(decoded)
  } catch {
    // Malformed preference values are ignored and the default filter order is used.
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (!Array.isArray(parsed)) continue
      return parsed.filter((value): value is string => typeof value === 'string')
    } catch {
      // Try the next candidate before falling back to the default filter order.
    }
  }

  return null
}

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

export function storedFilterOrderValues<T extends string>(
  defaultOrder: readonly T[],
  storedValue: string | null | undefined,
): T[] {
  return orderedFilterValues(defaultOrder, parseStoredFilterOrder(storedValue))
}

export function firstOrderedFilterValue<T extends string>(
  defaultOrder: readonly [T, ...T[]],
  storedValue: string | null | undefined,
): T {
  return storedFilterOrderValues(defaultOrder, storedValue)[0] ?? defaultOrder[0]
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

export function getInitialFilterHref(options: {
  activeValue: string
  queryParam: string
  search: string
  items: readonly FilterHrefItem[]
}): string | null {
  const search = options.search.startsWith('?') ? options.search.slice(1) : options.search
  const params = new URLSearchParams(search)
  if (params.has(options.queryParam)) return null

  const firstItem = options.items[0]
  if (!firstItem || firstItem.value === options.activeValue) return null

  const targetUrl = new URL(firstItem.href, 'https://agm.local')
  for (const [key, value] of targetUrl.searchParams) {
    params.set(key, value)
  }
  const query = params.toString()
  return query ? `${targetUrl.pathname}?${query}` : targetUrl.pathname
}
