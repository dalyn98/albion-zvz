import 'server-only'
import { getAdminClient } from './supabase-admin'
import { CATEGORY_NOTIFY_COLUMN, type EventCategory } from '@/types'

// Discord DM 발송용 공용 모듈.
//
// 웹 푸시 스택을 대체. 길드원은 모두 Discord 로그인을 거치므로 별도 구독 절차
// 없이 Discord ID 만으로 DM 을 보낼 수 있다.
//
// 수신 조건:
//   - guild_avatars.discord_dm_enabled = true (길드원) 또는
//     guests.discord_dm_enabled = true (게스트)
//   - 사용자가 봇의 DM 차단을 하지 않았고, 봇이 속한 길드와 공유 중
//
// 실패 처리: DM 을 거부한 사용자(403 / 50007)는 자동으로 토글을 끄지 않는다
// — 사용자가 Discord 설정에서 DM 허용을 껐을 수도 있고, 앱 내 토글과는 독립.
// 로그만 남기고 다음 수신자로 넘어간다.

const DISCORD_API = 'https://discord.com/api/v10'

export interface DiscordDmPayload {
  title: string
  body: string
  // 상대 경로면 APP_URL 을 앞에 붙이고, 절대 URL 이면 그대로 사용.
  url?: string
}

function getBotToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN ?? null
}

function getAppUrl(): string {
  const url = process.env.APP_URL
  if (!url) throw new Error('APP_URL not set')
  return url.replace(/\/$/, '')
}

export function isDiscordDmConfigured(): boolean {
  return !!process.env.DISCORD_BOT_TOKEN && !!process.env.APP_URL
}

// 입력받은 Discord ID 들 중 discord_dm_enabled = true 인 것만 통과시킨다.
// guild_avatars 와 guests 두 테이블에 나눠 저장돼 있으므로 둘 다 조회해 합집합.
//
// categoryFilter 가 주어지면 해당 카테고리의 개인 옵트아웃
// (notify_combat / notify_ff / notify_ganking) 도 함께 AND 조건으로 확인한다.
// 이벤트 임박 DM 전용. regear/donation 등 카테고리와 무관한 DM 은 categoryFilter
// 없이 호출한다.
export async function filterDmOptedIn(
  discordIds: string[],
  categoryFilter?: EventCategory,
): Promise<string[]> {
  if (discordIds.length === 0) return []
  const db = getAdminClient()
  const categoryColumn = categoryFilter ? CATEGORY_NOTIFY_COLUMN[categoryFilter] : null
  const columns = categoryColumn
    ? `discord_id, discord_dm_enabled, ${categoryColumn}`
    : 'discord_id, discord_dm_enabled'
  const [avatars, guests] = await Promise.all([
    db.from('guild_avatars').select(columns).in('discord_id', discordIds),
    db.from('guests').select(columns).in('discord_id', discordIds),
  ])
  const enabled = new Set<string>()
  // Supabase 의 dynamic select 는 반환 타입이 GenericStringError[] 로 좁혀져서
  // 일반 object 접근이 안 된다. 실제 런타임 형태는 Record 이므로 unknown 경유.
  const rows = [...(avatars.data ?? []), ...(guests.data ?? [])] as unknown as Array<
    Record<string, unknown> & { discord_id: string; discord_dm_enabled: boolean | null }
  >
  for (const row of rows) {
    if (!row.discord_dm_enabled) continue
    if (categoryColumn && row[categoryColumn] === false) continue
    enabled.add(row.discord_id)
  }
  return discordIds.filter((id) => enabled.has(id))
}

async function openDmChannel(token: string, userId: string): Promise<string | null> {
  const res = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: userId }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[discord-dm] openDmChannel failed for ${userId}: ${res.status} ${text}`)
    return null
  }
  const json = (await res.json()) as { id: string }
  return json.id
}

async function postDmMessage(
  token: string,
  channelId: string,
  payload: DiscordDmPayload,
): Promise<boolean> {
  const embedUrl = payload.url
    ? payload.url.startsWith('http')
      ? payload.url
      : `${getAppUrl()}${payload.url}`
    : undefined
  const embed = {
    title: payload.title,
    description: payload.body,
    url: embedUrl,
    // Discord blurple — 사이트 공지 / 이벤트 알림과 톤 맞춤.
    color: 0x5865f2,
    timestamp: new Date().toISOString(),
  }
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embeds: [embed] }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[discord-dm] postDmMessage failed: ${res.status} ${text}`)
    return false
  }
  return true
}

export interface DmResult {
  attempted: number
  succeeded: number
}

export async function sendDiscordDmsToUsers(
  discordIds: string[],
  payload: DiscordDmPayload,
  categoryFilter?: EventCategory,
): Promise<DmResult> {
  const token = getBotToken()
  if (!token) {
    console.warn('[discord-dm] DISCORD_BOT_TOKEN not set — skipping send')
    return { attempted: 0, succeeded: 0 }
  }
  const optedIn = await filterDmOptedIn(discordIds, categoryFilter)
  if (optedIn.length === 0) return { attempted: 0, succeeded: 0 }

  let succeeded = 0
  // 순차 처리 — 길드 규모(수십 명)에서 병렬화 이득이 작고 Discord rate limit
  // 대응이 단순해진다. 한 수신자 실패는 다음 수신자에 영향 없음.
  for (const userId of optedIn) {
    const channelId = await openDmChannel(token, userId)
    if (!channelId) continue
    const ok = await postDmMessage(token, channelId, payload)
    if (ok) succeeded++
  }
  return { attempted: optedIn.length, succeeded }
}

export async function sendDiscordDmToUser(
  discordId: string,
  payload: DiscordDmPayload,
): Promise<DmResult> {
  return sendDiscordDmsToUsers([discordId], payload)
}
