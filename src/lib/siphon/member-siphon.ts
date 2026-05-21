export interface SiphonAccountLedgerRow {
  loggedAt: string
  itemNameRaw: string
  quantity: number
}

export interface SiphonAccountSummary {
  player: string
  deposited: number
  withdrawn: number
  net: number
  lastActivityAt: string | null
  rows: SiphonAccountLedgerRow[]
}

export function summarizeSiphonAccount(
  player: string,
  rows: readonly SiphonAccountLedgerRow[],
  recentLimit: number,
): SiphonAccountSummary {
  const sorted = [...rows].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))
  let deposited = 0
  let withdrawn = 0

  for (const row of sorted) {
    if (row.quantity > 0) deposited += row.quantity
    else withdrawn += -row.quantity
  }

  return {
    player,
    deposited,
    withdrawn,
    net: deposited - withdrawn,
    lastActivityAt: sorted[0]?.loggedAt ?? null,
    rows: sorted.slice(0, Math.max(0, recentLimit)),
  }
}

