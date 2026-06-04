export const POSTGRES_INT_MAX = 2147483647

export function isPostgresPositiveInt(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= POSTGRES_INT_MAX
  )
}

export function isPostgresNonNegativeInt(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= POSTGRES_INT_MAX
  )
}
