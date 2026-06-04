// Albion 인게임 "은행"에서 복사한 상자 입출 로그를 파싱한다.
//
// 지원 입력 포맷:
//   1. TextEdit .rtf (Apple) — \uNNNN 유니코드 이스케이프 + 리터럴 탭
//   2. 탭 구분 평문 (일반 메모장 복사)
//
// 출력 레코드 한 줄 예시:
//   "04/21/2026 15:59:10"	"SoonSem"	"헤기물"	"0"	"1"	"-1"
//   → { loggedAt: Date(UTC), player: "SoonSem", itemName: "헤기물",
//       enchant: 0, quality: 1, quantity: -1 }
//
// 수량: 양수는 입고, 음수는 출고.

const POSTGRES_INT_MIN = -2147483648
const POSTGRES_INT_MAX = 2147483647

export interface ChestLogEntry {
  loggedAt: Date
  player: string
  itemName: string
  enchant: number
  quality: number
  quantity: number
}

export type ChestLogParseErrorCode =
  | 'chest_format'
  | 'chest_date'
  | 'chest_numeric_fields'

export interface ChestLogParseError {
  line: number
  text: string
  reason: string
  code?: ChestLogParseErrorCode
}

export interface ChestLogParseResult {
  entries: ChestLogEntry[]
  errors: ChestLogParseError[]
}

export function parseChestLog(raw: string): ChestLogParseResult {
  const text = raw.trimStart().startsWith('{\\rtf') ? rtfToPlain(raw) : raw

  const entries: ChestLogEntry[] = []
  const errors: ChestLogParseError[] = []

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    // 헤더 행은 클라이언트 언어에 따라 달라진다.
    if (isChestLogHeader(line)) continue

    const parsed = parseLine(line)
    if ('error' in parsed) {
      errors.push({ line: i + 1, text: line, ...parsed.error })
      continue
    }
    entries.push(parsed.entry)
  }

  return { entries, errors }
}

function parseLine(
  line: string,
): { entry: ChestLogEntry } | { error: Pick<ChestLogParseError, 'reason' | 'code'> } {
  const fields = splitQuotedTabs(line)
  if (fields.length !== 6) {
    return {
      error: {
        reason: 'chest log row must have 6 fields',
        code: 'chest_format',
      },
    }
  }

  const [dateStr, player, itemName, enchantStr, qualityStr, qtyStr] = fields
  const loggedAt = parseChestDate(dateStr)
  if (!loggedAt) {
    return {
      error: {
        reason: 'invalid chest log date',
        code: 'chest_date',
      },
    }
  }
  const enchant = parseIntegerInRange(enchantStr, 0, 4)
  const quality = parseIntegerInRange(qualityStr, 1, 5)
  const quantity = parseIntegerInRange(qtyStr, POSTGRES_INT_MIN, POSTGRES_INT_MAX)
  if (enchant === null || quality === null || quantity === null) {
    return {
      error: {
        reason: 'invalid chest log numeric fields',
        code: 'chest_numeric_fields',
      },
    }
  }

  return {
    entry: {
      loggedAt,
      player: player.trim(),
      itemName: itemName.trim(),
      enchant,
      quality,
      quantity,
    },
  }
}

function parseIntegerInRange(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim()
  if (!/^-?\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (!Number.isSafeInteger(n)) return null
  return n >= min && n <= max ? n : null
}

function isChestLogHeader(line: string): boolean {
  const fields = splitQuotedTabs(line)
  if (fields.length < 6) return false
  return (
    isHeaderAlias(fields[0], CHEST_HEADER_ALIASES.date) &&
    isHeaderAlias(fields[1], CHEST_HEADER_ALIASES.player) &&
    isHeaderAlias(fields[2], CHEST_HEADER_ALIASES.item) &&
    isHeaderAlias(fields[3], CHEST_HEADER_ALIASES.enchant) &&
    isHeaderAlias(fields[4], CHEST_HEADER_ALIASES.quality) &&
    isHeaderAlias(fields[5], CHEST_HEADER_ALIASES.quantity)
  )
}

const CHEST_HEADER_ALIASES = {
  date: ['날짜', 'date', 'time', 'datetime', 'timestamp', '日時', '日付', '時間', '日期', '时间'],
  player: ['플레이어', 'player', 'player name', 'プレイヤー', '玩家'],
  item: ['아이템', '아이템명', 'item', 'item name', 'アイテム', 'アイテム名', '物品', '物品名称'],
  enchant: ['인챈트', 'enchant', 'enchantment', 'エンチャント', '附魔'],
  quality: ['품질', 'quality', '品質', '质量'],
  quantity: ['수량', 'quantity', 'qty', '数量', '數量'],
} as const

function isHeaderAlias(value: string, aliases: readonly string[]): boolean {
  const normalized = normalizeHeaderCell(value)
  return aliases.some((alias) => normalizeHeaderCell(alias) === normalized)
}

function normalizeHeaderCell(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

// 각 셀은 쌍따옴표로 감싸이고 셀 사이는 탭. 셀 내부에 쌍따옴표가 없다고
// 가정한다 (Albion 로그는 그렇다). 탭이나 공백으로 분리된 셀 모두 수용.
function splitQuotedTabs(line: string): string[] {
  const cells = line.split(/\t+/)
  return cells.map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
}

// "MM/DD/YYYY HH:MM:SS" 또는 "YYYY-MM-DD HH:MM:SS" UTC — Albion 인게임 로그 기준.
function parseChestDate(s: string): Date | null {
  const trimmed = s.trim()
  const isoLike = trimmed.match(
    /^(\d{4})[-/.](\d{2})[-/.](\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
  )
  if (isoLike) {
    const [, yyyy, mm, dd, hh, min, ss] = isoLike
    return toUtcDate(yyyy, mm, dd, hh, min, ss)
  }

  const usLike = trimmed.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/,
  )
  if (usLike) {
    const [, mm, dd, yyyy, hh, min, ss] = usLike
    return toUtcDate(yyyy, mm, dd, hh, min, ss)
  }

  return null
}

function toUtcDate(
  yyyy: string,
  mm: string,
  dd: string,
  hh: string,
  min: string,
  ss: string,
): Date | null {
  const year = Number(yyyy)
  const month = Number(mm)
  const day = Number(dd)
  const hour = Number(hh)
  const minute = Number(min)
  const second = Number(ss)
  if (
    !Number.isInteger(year) ||
    year < 1970 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    !Number.isInteger(second) ||
    second < 0 ||
    second > 59
  ) {
    return null
  }

  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return Number.isNaN(d.getTime()) ? null : d
}

// RTF → 평문. TextEdit 저장 RTF 의 서브셋만 처리 — 폰트/컬러 테이블 제거 +
// \uNNNN 이스케이프 디코딩 + 컨트롤 워드 삭제. 탭/개행은 원본 문자를 유지.
function rtfToPlain(rtf: string): string {
  let s = rtf
  // 테이블 블록 제거: {\fonttbl ...} 등.
  s = s.replace(/\{\\(fonttbl|colortbl|\*\\expandedcolortbl|stylesheet|info)[^{}]*\}/g, '')
  // \uc0 디렉티브 (다음 N 바이트 ASCII 폴백 무시). 우리는 폴백 없이 바로
  // 유니코드만 사용하므로 폴백 스킵 카운트만 제거.
  s = s.replace(/\\uc\d+\s?/g, '')
  // 유니코드 이스케이프. RTF \uN 은 signed 16-bit, 음수는 +65536.
  s = s.replace(/\\u(-?\d+)\s?/g, (_, n) => {
    let cp = Number(n)
    if (cp < 0) cp += 65536
    return String.fromCodePoint(cp)
  })
  // RTF 는 줄 끝의 `\` 를 줄 이어쓰기로 쓴다 — 개행으로 변환해서 행 단위로 나눠 읽는다.
  s = s.replace(/\\\r?\n/g, '\n')
  // 남은 컨트롤 워드/심볼 제거.
  s = s.replace(/\\[a-z*]+-?\d*\s?/gi, '')
  s = s.replace(/[{}]/g, '')
  return s
}
