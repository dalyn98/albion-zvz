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

export interface SiphonIdentityGate {
  identity: { nickname?: string | null } | null
  resourceTrusted: boolean
}

export type SiphonPlayerResolution =
  | { status: 'ready'; player: string }
  | { status: 'unverified'; nickname: string | null }

export function resolveSiphonPlayer(
  gate: SiphonIdentityGate,
): SiphonPlayerResolution {
  const nickname = gate.identity?.nickname?.trim() || null
  if (!gate.resourceTrusted || !nickname) {
    return { status: 'unverified', nickname }
  }
  return { status: 'ready', player: nickname }
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
