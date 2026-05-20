export interface SettlementLedgerRow {
  discordId: string
  delta: number
  reason: string
  createdAt: string
}

export interface SettlementMember {
  discordId: string
  username: string | null
}

export interface SettlementLineDraft {
  discordId: string
  username: string | null
  openingBalance: number
  earned: number
  spent: number
  closingBalance: number
  receivableSilver: number
  payableSilver: number
  ledgerEntryCount: number
  sourceBreakdown: Record<string, number>
  sinkBreakdown: Record<string, number>
}

export interface BuildSettlementLinesInput {
  periodStartIso: string
  periodEndIso: string
  ledgerRows: readonly SettlementLedgerRow[]
  members?: readonly SettlementMember[]
}

interface MutableLine {
  discordId: string
  username: string | null
  openingBalance: number
  earned: number
  spent: number
  periodDelta: number
  ledgerEntryCount: number
  sourceBreakdown: Record<string, number>
  sinkBreakdown: Record<string, number>
}

export function buildSettlementLines({
  periodStartIso,
  periodEndIso,
  ledgerRows,
  members = [],
}: BuildSettlementLinesInput): SettlementLineDraft[] {
  const startMs = Date.parse(periodStartIso)
  const endMs = Date.parse(periodEndIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('Invalid settlement period')
  }

  const namesByDiscord = new Map(members.map((m) => [m.discordId, m.username]))
  const lines = new Map<string, MutableLine>()

  const ensureLine = (discordId: string): MutableLine => {
    const existing = lines.get(discordId)
    if (existing) return existing
    const next: MutableLine = {
      discordId,
      username: namesByDiscord.get(discordId) ?? null,
      openingBalance: 0,
      earned: 0,
      spent: 0,
      periodDelta: 0,
      ledgerEntryCount: 0,
      sourceBreakdown: {},
      sinkBreakdown: {},
    }
    lines.set(discordId, next)
    return next
  }

  for (const row of ledgerRows) {
    const delta = Math.trunc(row.delta)
    if (!row.discordId || !Number.isFinite(delta) || delta === 0) continue
    const createdMs = Date.parse(row.createdAt)
    if (!Number.isFinite(createdMs) || createdMs >= endMs) continue

    const line = ensureLine(row.discordId)
    if (createdMs < startMs) {
      line.openingBalance += delta
      continue
    }

    line.periodDelta += delta
    line.ledgerEntryCount += 1
    if (delta > 0) {
      line.earned += delta
      line.sourceBreakdown[row.reason] = (line.sourceBreakdown[row.reason] ?? 0) + delta
    } else {
      const spent = -delta
      line.spent += spent
      line.sinkBreakdown[row.reason] = (line.sinkBreakdown[row.reason] ?? 0) + spent
    }
  }

  return Array.from(lines.values())
    .map((line) => {
      const closingBalance = line.openingBalance + line.periodDelta
      return {
        discordId: line.discordId,
        username: line.username,
        openingBalance: line.openingBalance,
        earned: line.earned,
        spent: line.spent,
        closingBalance,
        receivableSilver: Math.max(closingBalance, 0),
        payableSilver: Math.max(-closingBalance, 0),
        ledgerEntryCount: line.ledgerEntryCount,
        sourceBreakdown: line.sourceBreakdown,
        sinkBreakdown: line.sinkBreakdown,
      }
    })
    .filter((line) =>
      line.openingBalance !== 0 ||
      line.earned !== 0 ||
      line.spent !== 0 ||
      line.closingBalance !== 0
    )
    .sort((a, b) => {
      if (b.receivableSilver !== a.receivableSilver) return b.receivableSilver - a.receivableSilver
      if (b.payableSilver !== a.payableSilver) return b.payableSilver - a.payableSilver
      return (a.username ?? a.discordId).localeCompare(b.username ?? b.discordId)
    })
}
