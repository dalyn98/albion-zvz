export const SIPHON_ACCOUNTING_MODES = ['record', 'personal_custody'] as const

export type SiphonAccountingMode = (typeof SIPHON_ACCOUNTING_MODES)[number]

export function parseSiphonAccountingMode(value: unknown): SiphonAccountingMode {
  return value === 'record' ? 'record' : 'personal_custody'
}

export function siphonActivityTotal(input: {
  deposited: number
  withdrawn: number
}): number {
  return input.deposited + input.withdrawn
}
