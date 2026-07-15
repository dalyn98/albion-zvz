export type RegearOriginFilter = 'auto' | 'manual' | 'all'

export type RegearOriginFilterSpec =
  | { kind: 'eq'; value: true }
  | { kind: 'or'; expression: string }

// Legacy rows predate auto_generated and therefore contain null. They were
// created through the member form, so the operator-facing meaning is manual.
export function getRegearOriginFilterSpec(
  origin: RegearOriginFilter,
): RegearOriginFilterSpec | null {
  if (origin === 'auto') return { kind: 'eq', value: true }
  if (origin === 'manual') {
    return {
      kind: 'or',
      expression: 'auto_generated.eq.false,auto_generated.is.null',
    }
  }
  return null
}
