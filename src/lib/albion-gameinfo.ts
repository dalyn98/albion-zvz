// 온보딩 전용 Gameinfo 클라이언트. 유저가 3개 서버 중 하나를 고르고 닉네임으로
// 자신의 캐릭터를 찾아 길드 소속을 확인하기 위해 쓴다. killboard.ts 와 달리
// 서버가 인자로 들어오고, 검색은 prefix/substring 매칭(후보 리스트)을 허용한다.
//
// - /search?q={nick}  → 플레이어/길드 후보 (drop-down 용)
// - /players/{id}     → 상세 (인증 시점에 길드 ID 확정용)

export type AlbionServer = 'west' | 'east' | 'europe'

const SERVER_ENDPOINTS: Record<AlbionServer, string> = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}

export const ALBION_SERVERS: AlbionServer[] = ['west', 'east', 'europe']

export function isAlbionServer(v: unknown): v is AlbionServer {
  return v === 'west' || v === 'east' || v === 'europe'
}

export interface GameinfoPlayer {
  Id: string
  Name: string
  GuildId: string | null
  GuildName: string | null
  AllianceId?: string | null
  AllianceName?: string | null
  KillFame?: number
  DeathFame?: number
  FameRatio?: number
}

interface SearchResponse {
  guilds: Array<{ Id: string; Name: string }>
  players: GameinfoPlayer[]
}

async function fetchJson<T>(url: string, opts: { fresh?: boolean } = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-onboarding/1.0' },
      // fresh=true: 인증 확정 시점처럼 실시간 데이터가 필요한 호출. 드롭다운 검색
      // 처럼 동일 쿼리가 연달아 발생하는 경로만 5분 캐시를 쓴다.
      ...(opts.fresh
        ? { cache: 'no-store' as const }
        : { next: { revalidate: 300 } }),
    })
    if (!res.ok) throw new Error(`gameinfo ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

// 닉네임 prefix/substring 으로 후보 플레이어 리스트 조회. Gameinfo 공식
// 서버는 이미 prefix 기반 fuzzy 매칭을 반환하므로 추가 가공은 하지 않는다.
// 한글 닉네임 가능성을 고려해 encodeURIComponent 필수.
export async function searchPlayers(
  server: AlbionServer,
  query: string,
  limit = 10,
): Promise<GameinfoPlayer[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const base = SERVER_ENDPOINTS[server]
  const url = `${base}/search?q=${encodeURIComponent(trimmed)}`
  try {
    const data = await fetchJson<SearchResponse>(url)
    return (data.players ?? []).slice(0, limit)
  } catch {
    return []
  }
}

// 길드명으로 후보 길드 리스트. 관리자가 /admin/dashboard/settings 에서 홈 길드
// ID 를 고를 때 쓴다. Gameinfo /search 의 guilds 필드를 그대로 반환.
export interface GameinfoGuild {
  Id: string
  Name: string
}

export async function searchGuilds(
  server: AlbionServer,
  query: string,
  limit = 10,
): Promise<GameinfoGuild[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const base = SERVER_ENDPOINTS[server]
  const url = `${base}/search?q=${encodeURIComponent(trimmed)}`
  try {
    const data = await fetchJson<SearchResponse>(url)
    return (data.guilds ?? []).slice(0, limit)
  } catch {
    return []
  }
}

// UUID 로 길드 상세 조회. 설정 화면에서 저장돼 있는 홈 길드 ID 로 이름을
// 역조회할 때 사용. /search 는 닉네임 기반이라 UUID 로는 못 찾음.
// 5분 캐시 허용 — 길드명이 바뀌는 일은 거의 없고, 관리자 설정 페이지가
// revalidatePath 로 무효화하므로 저장 직후에도 최신 값이 따라온다.
export async function getGuild(
  server: AlbionServer,
  guildId: string,
): Promise<GameinfoGuild | null> {
  const trimmed = guildId.trim()
  if (!trimmed) return null
  const base = SERVER_ENDPOINTS[server]
  const url = `${base}/guilds/${encodeURIComponent(trimmed)}`
  try {
    return await fetchJson<GameinfoGuild>(url)
  } catch {
    return null
  }
}

// 특정 플레이어 ID 의 상세 조회. 인증 시점에 GuildId 를 재확인하기 위해 사용.
// Next.js fetch 캐시가 플레이어가 길드 가입하기 전의 응답을 5분간 물고 있으면
// 가입한 뒤 온보딩해도 계속 미인증이 되므로 fresh 모드(캐시 우회) 로 호출한다.
// 실패 시 null 반환 — 호출부에서 "Gameinfo 장애" 로 처리.
export async function getPlayer(
  server: AlbionServer,
  playerId: string,
): Promise<GameinfoPlayer | null> {
  const base = SERVER_ENDPOINTS[server]
  const url = `${base}/players/${encodeURIComponent(playerId)}`
  try {
    return await fetchJson<GameinfoPlayer>(url, { fresh: true })
  } catch {
    return null
  }
}

// UI 용 라벨. 서버 선택 드롭다운/배지에 같은 문자열을 쓰기 위해 모아 둔다.
export const ALBION_SERVER_LABEL: Record<AlbionServer, string> = {
  west: 'Americas',
  east: 'Asia (SGP)',
  europe: 'Europe',
}
