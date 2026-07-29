export type RegearOriginFilter = 'event' | 'free_window' | 'auto' | 'all'

export type RegearOriginFilterSpec =
  | { kind: 'eq'; value: Exclude<RegearOriginFilter, 'all'> }

export function getRegearOriginFilterSpec(
  origin: RegearOriginFilter,
): RegearOriginFilterSpec | null {
  return origin === 'all' ? null : { kind: 'eq', value: origin }
}
