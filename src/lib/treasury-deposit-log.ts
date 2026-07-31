export interface TreasuryDepositLogEntry {
  depositedAt: string
  depositorName: string
  amountSilver: number
  fingerprintInput: string
}

export interface TreasuryDepositLogParseResult {
  entries: TreasuryDepositLogEntry[]
  skippedLines: number[]
}

const DEPOSIT_ACTION = /^(?:deposit(?:ed)?|silver deposit|기부|입금|入金|存入|银币存入)$/iu
const HEADER_HINT = /(?:date|time|timestamp|player|member|amount|silver|날짜|시간|유저|금액|プレイヤー|金額|玩家|银币)/iu

function splitColumns(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : null
  if (!delimiter) return []
  return line.split(delimiter).map((value) => value.trim().replace(/^"|"$/g, ''))
}

function parseAmount(raw: string): number | null {
  const normalized = raw.replace(/[\s,_]/g, '')
  if (!/^[0-9]+$/.test(normalized)) return null
  const amount = Number(normalized)
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
    return null
  }
  return amount
}

function parseTimestamp(raw: string): string | null {
  const milliseconds = Date.parse(raw)
  if (!Number.isFinite(milliseconds)) return null
  return new Date(milliseconds).toISOString()
}

function normalizeName(raw: string): string | null {
  const name = raw.trim()
  if (name.length < 2 || name.length > 64) return null
  return name
}

export function parseTreasuryDepositLog(raw: string): TreasuryDepositLogParseResult {
  const entries: TreasuryDepositLogEntry[] = []
  const skippedLines: number[] = []
  const seen = new Set<string>()

  raw.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim()
    if (!line) return
    const columns = splitColumns(line)
    if (columns.length !== 3 && columns.length !== 4) {
      skippedLines.push(index + 1)
      return
    }

    const [timestampRaw, nameRaw] = columns
    const actionRaw = columns.length === 4 ? columns[2] : null
    const amountRaw = columns.at(-1) ?? ''
    const depositedAt = parseTimestamp(timestampRaw)
    if (!depositedAt && index === 0 && HEADER_HINT.test(line)) return
    const depositorName = normalizeName(nameRaw)
    const amountSilver = parseAmount(amountRaw)
    if (
      !depositedAt ||
      !depositorName ||
      amountSilver === null ||
      (actionRaw !== null && !DEPOSIT_ACTION.test(actionRaw))
    ) {
      skippedLines.push(index + 1)
      return
    }

    const fingerprintInput = [
      depositedAt,
      depositorName.toLocaleLowerCase('en-US'),
      String(amountSilver),
    ].join('|')
    if (seen.has(fingerprintInput)) return
    seen.add(fingerprintInput)
    entries.push({ depositedAt, depositorName, amountSilver, fingerprintInput })
  })

  return { entries, skippedLines }
}
