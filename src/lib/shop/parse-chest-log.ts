// Albion 인게임 "은행"에서 복사한 상자 입출 로그를 파싱한다.
//
// 지원 입력 포맷:
//   1. TextEdit .rtf (Apple) — \uNNNN 유니코드 이스케이프 + 리터럴 탭
//   2. 탭 구분 평문 (일반 메모장 복사)
//
// 출력 레코드 한 줄 예시:
//   "04/21/2026 15:59:10"	"SoonSem"	"헤기물"	"0"	"1"	"-1"
//   → { loggedAt: Date(KST), player: "SoonSem", itemName: "헤기물",
//       enchant: 0, quality: 1, quantity: -1 }
//
// 수량: 양수는 입고, 음수는 출고.

export interface ChestLogEntry {
  loggedAt: Date
  player: string
  itemName: string
  enchant: number
  quality: number
  quantity: number
}

export interface ChestLogParseError {
  line: number
  text: string
  reason: string
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
    // 헤더 행 — "날짜" 로 시작하거나 탭 없이 단독
    if (line.startsWith('"날짜"')) continue

    const parsed = parseLine(line)
    if (!parsed) {
      errors.push({ line: i + 1, text: line, reason: '형식 불일치 (6필드 탭 구분 필요)' })
      continue
    }
    entries.push(parsed)
  }

  return { entries, errors }
}

function parseLine(line: string): ChestLogEntry | null {
  const fields = splitQuotedTabs(line)
  if (fields.length !== 6) return null

  const [dateStr, player, itemName, enchantStr, qualityStr, qtyStr] = fields
  const loggedAt = parseChestDate(dateStr)
  if (!loggedAt) return null
  const enchant = Number(enchantStr)
  const quality = Number(qualityStr)
  const quantity = Number(qtyStr)
  if (!Number.isFinite(enchant) || !Number.isFinite(quality) || !Number.isFinite(quantity)) {
    return null
  }

  return {
    loggedAt,
    player: player.trim(),
    itemName: itemName.trim(),
    enchant,
    quality,
    quantity,
  }
}

// 각 셀은 쌍따옴표로 감싸이고 셀 사이는 탭. 셀 내부에 쌍따옴표가 없다고
// 가정한다 (Albion 로그는 그렇다). 탭이나 공백으로 분리된 셀 모두 수용.
function splitQuotedTabs(line: string): string[] {
  const cells = line.split(/\t+/)
  return cells.map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
}

// "MM/DD/YYYY HH:MM:SS" KST — 인게임 시간은 한국 서버 기준.
function parseChestDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const [, mm, dd, yyyy, hh, min, ss] = m
  const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+09:00`
  const d = new Date(iso)
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
