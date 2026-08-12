import 'server-only'
import { getAdminClient } from './supabase-admin'
import { log } from './log'
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
// 사용자 간 동시 호출 개수. Discord global rate limit 은 bot token 당 ~50/s 라
// 동시성 5 + 사용자당 2 API call 기준 이론상 10/s 정도로 제한 — 안전 마진 충분.
const DM_CONCURRENCY = 5
// 한 호출당 429 재시도 횟수. Retry-After 헤더 따라 대기 후 재시도. 두 번 이상
// 연속 429 면 일시적 글로벌 제한일 가능성 — 다음 수신자로 넘어가 손실 최소화.
const MAX_429_RETRIES = 2

// 429 Too Many Requests 대응. Discord 는 retry-after 헤더 (초) 를 함께 보내며
// 글로벌·라우트 한도가 따로 있다. 한도 도달 시 헤더만큼 대기 후 재시도.
async function fetchWithRateLimit(input: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(input, init)
    if (res.status !== 429) return res
    if (attempt === MAX_429_RETRIES) return res
    const retryAfter = Number(res.headers.get('retry-after') ?? '1')
    // 0.5s 미만은 의미 없고, 10s 초과는 단일 호출 대기로는 너무 길다 → clamp.
    const waitMs = Math.min(Math.max(retryAfter, 0.5), 10) * 1000
    log.warn('[discord-dm] 429 received', {
      retry_after_seconds: retryAfter,
      wait_ms: waitMs,
      attempt: attempt + 1,
      max_attempts: MAX_429_RETRIES,
    })
    await new Promise((r) => setTimeout(r, waitMs))
  }
  // 루프가 끝났지만 위 분기로 빠져나오지 못한 경우 — 안전을 위해 throw.
  throw new Error('[discord-dm] fetchWithRateLimit: unreachable')
}

export interface DiscordDmPayload {
  title: string
  body: string
  // 상대 경로면 APP_URL 을 앞에 붙이고, 절대 URL 이면 그대로 사용.
  url?: string
  // Discord 링크 버튼. 인증 토큰이 든 URL 은 embed URL 로 넣으면 unfurl 요청에
  // 소비될 수 있으므로 actions 로 전달해 버튼으로만 노출한다.
  actions?: DiscordDmAction[]
  // Stable logical-delivery nonce. Discord rejects a recent duplicate when
  // enforce_nonce is enabled, closing the worker-crash retry gap.
  deliveryNonce?: string
}

export interface DiscordDmAction {
  label: string
  url: string
}

export interface DiscordDmActionRow {
  type: 1
  components: Array<{
    type: 2
    style: 5
    label: string
    url: string
  }>
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

function resolveDiscordDmUrl(rawUrl: string, appUrl: string): string | null {
  try {
    const url = new URL(rawUrl, `${appUrl.replace(/\/$/, '')}/`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function buildDiscordDmActionRows(
  actions: readonly DiscordDmAction[] | undefined,
  appUrl: string,
): DiscordDmActionRow[] {
  const buttons = (actions ?? [])
    .flatMap((action) => {
      const label = action.label.trim().slice(0, 80)
      const url = resolveDiscordDmUrl(action.url, appUrl)
      if (!label || !url) return []
      return [{ type: 2 as const, style: 5 as const, label, url }]
    })
    .slice(0, 5)
  return buttons.length > 0 ? [{ type: 1, components: buttons }] : []
}

// 입력받은 Discord ID 들 중 해당 tenant(guildId) 에서 discord_dm_enabled = true 인
// 것만 통과시킨다. guild_avatars 와 guests 두 테이블에 나눠 저장돼 있으므로 둘 다
// 조회해 합집합.
//
// guildId 를 반드시 받아 per-tenant 로 필터링한다 — 한 Discord 유저가 여러 tenant
// 에 소속돼 있고 tenant A 에서 DM on, tenant B 에서 off 일 때, tenant B 의 DM 이
// tenant A 의 설정을 근거로 발송되지 않도록 한다 (cross-tenant 누설 방지).
//
// categoryFilter 가 주어지면 해당 카테고리의 개인 옵트아웃
// (notify_combat / notify_ff / notify_ganking) 도 함께 AND 조건으로 확인한다.
// 이벤트 임박 DM 전용. regear/donation 등 카테고리와 무관한 DM 은 categoryFilter
// 없이 호출한다.
export async function filterDmOptedIn(
  discordIds: string[],
  guildId: string,
  categoryFilter?: EventCategory,
): Promise<string[]> {
  if (discordIds.length === 0) return []
  const db = getAdminClient()
  const categoryColumn = categoryFilter ? CATEGORY_NOTIFY_COLUMN[categoryFilter] : null
  const columns = categoryColumn
    ? `discord_id, discord_dm_enabled, ${categoryColumn}`
    : 'discord_id, discord_dm_enabled'
  const [avatars, guests] = await Promise.all([
    db
      .from('guild_avatars')
      .select(columns)
      .eq('guild_id', guildId)
      .in('discord_id', discordIds),
    db
      .from('guests')
      .select(columns)
      .eq('guild_id', guildId)
      .in('discord_id', discordIds),
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
  const res = await fetchWithRateLimit(`${DISCORD_API}/users/@me/channels`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: userId }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    log.error('[discord-dm] openDmChannel failed', undefined, {
      discord_id: userId,
      status: res.status,
      response: text,
    })
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
  const appUrl = payload.url || payload.actions?.length ? getAppUrl() : ''
  const embedUrl = payload.url ? resolveDiscordDmUrl(payload.url, appUrl) ?? undefined : undefined
  const components = buildDiscordDmActionRows(payload.actions, appUrl)
  const embed = {
    title: payload.title,
    description: payload.body,
    url: embedUrl,
    // Discord blurple — 사이트 공지 / 이벤트 알림과 톤 맞춤.
    color: 0x5865f2,
    timestamp: new Date().toISOString(),
  }
  const res = await fetchWithRateLimit(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      embeds: [embed],
      ...(components.length > 0 ? { components } : {}),
      ...(payload.deliveryNonce
        ? { nonce: payload.deliveryNonce, enforce_nonce: true }
        : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    log.error('[discord-dm] postDmMessage failed', undefined, {
      channel_id: channelId,
      status: res.status,
      response: text,
    })
    return false
  }
  return true
}

export interface DmResult {
  attempted: number
  succeeded: number
}

// guildId 는 DM 옵트인 여부를 해당 tenant 기준으로만 판정하기 위한 필수 인자.
// 교차-tenant 누설을 막는다 — filterDmOptedIn 주석 참조.
export async function sendDiscordDmsToUsers(
  discordIds: string[],
  guildId: string,
  payload: DiscordDmPayload,
  categoryFilter?: EventCategory,
): Promise<DmResult> {
  const token = getBotToken()
  if (!token) {
    log.warn('[discord-dm] DISCORD_BOT_TOKEN not set — skipping send', {
      tenant_id: guildId,
    })
    return { attempted: 0, succeeded: 0 }
  }
  const optedIn = await filterDmOptedIn(discordIds, guildId, categoryFilter)
  if (optedIn.length === 0) return { attempted: 0, succeeded: 0 }

  // 배치 동시성 — 길드 규모가 커지면 직렬은 분 단위로 걸린다. fetchWithRateLimit
  // 가 429 를 처리하므로 동시성 N 이어도 안전. 한 수신자 실패는 다음에 영향 없음.
  let succeeded = 0
  for (let i = 0; i < optedIn.length; i += DM_CONCURRENCY) {
    const batch = optedIn.slice(i, i + DM_CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (userId) => {
        try {
          const channelId = await openDmChannel(token, userId)
          if (!channelId) return false
          return await postDmMessage(token, channelId, payload)
        } catch (e) {
          log.error('[discord-dm] send threw', e, {
            discord_id: userId,
            tenant_id: guildId,
          })
          return false
        }
      }),
    )
    succeeded += results.filter(Boolean).length
  }
  return { attempted: optedIn.length, succeeded }
}

export async function sendDiscordDmToUser(
  discordId: string,
  guildId: string,
  payload: DiscordDmPayload,
): Promise<DmResult> {
  return sendDiscordDmsToUsers([discordId], guildId, payload)
}
