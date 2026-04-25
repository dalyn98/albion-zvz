// Discord OAuth2 + guild-member role check.
//
// Flow: redirect user to Discord with `identify guilds.members.read`, exchange
// the returned code for a bearer token, then read the user's member object
// in *our* guild to confirm they actually belong and carry the right role.
// `guilds.members.read` is the scope that lets us fetch roles without a bot.

const DISCORD_API = 'https://discord.com/api/v10'
// identify: 유저 기본 프로필. guilds: 유저의 길드 목록 (tenant 매칭).
// guilds.members.read: 선택된 길드 내 역할 조회.
const OAUTH_SCOPES = 'identify guilds guilds.members.read'

export interface DiscordUser {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
  // Discord 계정 설정의 언어 태그. "ko", "ja", "en-US" 같은 BCP-47 형식.
  // 미설정/일부 엔드포인트 응답에서 생략될 수 있어 optional. 사이트 진입 시
  // preferred_language 가 비어있으면 이 값을 매핑해 초기 언어로 쓴다.
  locale?: string | null
}

export interface DiscordGuildMember {
  user?: DiscordUser
  nick: string | null
  roles: string[]
}

// OAuth 관련 설정은 모든 tenant 가 공유한다 (단일 Discord 앱). env 에서만 읽는다.
export interface DiscordOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  appUrl: string
}

export function getDiscordOAuthConfig(): DiscordOAuthConfig {
  const clientId = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  const appUrl = process.env.APP_URL
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error('Discord OAuth env vars not fully set (DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, APP_URL)')
  }
  return {
    clientId,
    clientSecret,
    appUrl,
    redirectUri: `${appUrl.replace(/\/$/, '')}/api/auth/discord/callback`,
  }
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getDiscordOAuthConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    state,
  })
  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

// 봇 설치용 OAuth URL. `bot` + `applications.commands` scope 와 필요 권한 bitmask.
// VIEW_CHANNEL(0x400) + SEND_MESSAGES(0x800) + EMBED_LINKS(0x4000) +
// MANAGE_NICKNAMES(0x8000000) = 134236036.
// 멤버 역할/관리 역할은 설치 시점에 결정되지 않으므로 MANAGE_ROLES 는 제외 —
// 길드 운영자가 수동으로 역할을 부여한다.
const BOT_PERMISSIONS = (0x400 | 0x800 | 0x4000 | 0x8000000).toString()

export function buildBotInstallUrl(options: {
  guildId: string
  state: string
}): string {
  const { clientId, appUrl } = getDiscordOAuthConfig()
  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/auth/discord/bot-callback`
  // 순수 봇 설치 흐름 — response_type=code 를 빼면 Discord 가 봇 설치 동의 화면을
  // 띄운다 (response_type=code 를 넣으면 user OAuth 코드 그랜트로 처리되면서 봇
  // 설치 단계를 스킵하는 사례가 있어 제거).
  //
  // identify 스코프를 같이 묶는 이유: 사용자가 사이트와 Discord 앱/웹에서 서로
  // 다른 계정을 쓸 수 있다. 사이트 세션이 A 계정인데 봇 설치는 B 계정으로 한
  // 경우 — A 를 tenant 소유자로 박으면 정작 MANAGE_GUILD 를 가진 B 가 사이트에
  // 접근 못 한다. 이 콜백에서 code 를 토큰으로 바꿔 /users/@me 로 진짜 설치자
  // (B) 를 확정하고 그 사람을 tenant 소유자/admin 으로 세팅한다.
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot applications.commands identify',
    permissions: BOT_PERMISSIONS,
    guild_id: options.guildId,
    disable_guild_select: 'true',
    redirect_uri: redirectUri,
    state: options.state,
  })
  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

// 봇 설치 OAuth 의 code 를 access_token 으로 교환. user OAuth 와는 redirect_uri
// 가 달라야 (Discord 의 code 는 redirect_uri 와 정확히 일치해야 교환됨) 별도
// 함수로 둔다.
export async function exchangeBotInstallCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, appUrl } = getDiscordOAuthConfig()
  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/auth/discord/bot-callback`
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord bot install token exchange failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<TokenResponse>
}

// 봇이 길드에 들어있다는 전제로 길드 메타(이름/아이콘)를 읽어온다. 봇 설치
// 콜백 직후 tenants row 를 만들 때 사용.
export interface DiscordGuild {
  id: string
  name: string
  icon: string | null
}

export async function getDiscordGuild(
  discordGuildId: string,
): Promise<DiscordGuild | null> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) throw new Error('DISCORD_BOT_TOKEN not configured')
  const res = await fetch(`${DISCORD_API}/guilds/${discordGuildId}`, {
    headers: { Authorization: `Bot ${botToken}` },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Discord guild fetch failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<DiscordGuild>
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getDiscordOAuthConfig()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord token exchange failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<TokenResponse>
}

// Discord 의 user.locale (BCP-47 태그) 를 사이트에서 지원하는 Locale 로 매핑.
// 지원하지 않는 언어는 null 을 돌려줘서 호출부가 welcome-language 페이지로
// 유도하도록 한다. "en-US", "en-GB" 등 지역 변형은 모두 en 으로 모은다.
export function mapDiscordLocale(
  locale: string | null | undefined,
): 'ko' | 'ja' | 'en' | null {
  if (!locale) return null
  const lower = locale.toLowerCase()
  if (lower === 'ko' || lower.startsWith('ko-')) return 'ko'
  if (lower === 'ja' || lower.startsWith('ja-')) return 'ja'
  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  return null
}

// Falls back to the plain user profile (no guild context) so we can still
// identify guests who aren't in the guild. `identify` scope is enough.
export async function getCurrentUser(accessToken: string): Promise<DiscordUser | null> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord user fetch failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<DiscordUser>
}

export async function getGuildMember(
  accessToken: string,
  discordGuildId: string,
): Promise<DiscordGuildMember | null> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${discordGuildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    // Member data can change (role added/removed); never serve a cached copy.
    cache: 'no-store',
  })
  // 404 = user is not in the guild. We treat that as a clean "no" rather
  // than an error so the caller can show a friendly message.
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord member fetch failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<DiscordGuildMember>
}

// 유저가 속한 Discord 길드 목록. Phase 3 온보딩에서 tenant 매칭 / 길드 피커에 사용.
// OAuth `guilds` scope 가 필요하다 — `buildAuthorizeUrl` 의 OAUTH_SCOPES 참조.
export interface DiscordUserGuild {
  id: string
  name: string
  icon: string | null
  owner: boolean
  // permissions 는 유저가 해당 길드에서 갖는 권한 bitmask (string 으로 옴).
  // 0x20 = MANAGE_GUILD — 봇 초대에 필요.
  permissions: string
}

export async function listUserGuilds(accessToken: string): Promise<DiscordUserGuild[]> {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Discord user guilds fetch failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<DiscordUserGuild[]>
}

export interface DiscordIdentity {
  discordId: string
  username: string
  avatar: string | null
  isMember: boolean
  isAdmin: boolean
}

export function identityFromMember(
  member: DiscordGuildMember,
  memberRoleIds: string[],
  adminRoleIds: string[],
): DiscordIdentity | null {
  if (!member.user) return null
  const roles = new Set(member.roles)
  const isAdmin = adminRoleIds.some((id) => roles.has(id))
  const isMember = memberRoleIds.some((id) => roles.has(id)) || isAdmin
  return {
    discordId: member.user.id,
    // Prefer server nickname, then global_name (display name), then username.
    // Global names don't have the legacy discriminator so they read cleanly.
    username: member.nick || member.user.global_name || member.user.username,
    avatar: member.user.avatar,
    isMember,
    isAdmin,
  }
}

// Bulk guild member listing — bot 전용. OAuth `guilds.members.read` 와 달리
// 서버 전체 멤버를 훑어야 하므로 bot token + GUILD_MEMBERS privileged intent 가
// 필요하다. Developer Portal → Bot → Privileged Gateway Intents 에서 Server
// Members Intent 를 켜둔 봇만 200 을 반환, 아니면 Discord 는 403 을 돌려준다.
//
// 페이징: limit=1000 (Discord 상한) + after=<last_user_id> 커서. page.length
// < 1000 이면 마지막 페이지. Menhera 길드 규모(<300명) 에서는 사실상 1 페이지로
// 끝나지만 안전하게 루프를 돌린다.
export interface DiscordGuildMemberBulk {
  user: DiscordUser | null
  nick: string | null
  roles: string[]
}

export async function listGuildMembersBulk(
  discordGuildId: string,
): Promise<DiscordGuildMemberBulk[]> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) throw new Error('DISCORD_BOT_TOKEN not configured')

  const all: DiscordGuildMemberBulk[] = []
  let after: string | undefined
  while (true) {
    const params = new URLSearchParams({ limit: '1000' })
    if (after) params.set('after', after)
    const res = await fetch(`${DISCORD_API}/guilds/${discordGuildId}/members?${params.toString()}`, {
      headers: { Authorization: `Bot ${botToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Discord bulk members fetch failed (${res.status}): ${text}`)
    }
    const page = (await res.json()) as DiscordGuildMemberBulk[]
    if (page.length === 0) break
    all.push(...page)
    if (page.length < 1000) break
    const lastId = page[page.length - 1]?.user?.id
    if (!lastId) break
    after = lastId
  }
  return all
}

export interface EventNotificationPayload {
  id: string
  title: string
  gather_at: string
  gather_time: string
  gather_location: string
  special_notes: string | null
  // 이벤트에 연결된 Discord 역할 ID. 채널 알림 시 이 역할만 멘션한다.
  // NULL 이면 아무 역할도 멘션하지 않고 조용한 채널 메시지만 보낸다.
  notify_role_id: string | null
  // 이벤트가 지정한 공지 채널. NULL 이면 호출부가 env fallback 을 넘긴다.
  notify_channel_id: string | null
}

// Asia/Seoul 은 의도된 고정값 — Albion KR 서버 시간을 기준으로 알림이 나가야
// 한다. locale 만 호출자가 넘기는 값(알림을 트리거한 관리자 locale)으로 동적.
function formatGatherAt(iso: string, locale: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toLocaleString(locale, {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export interface EventNotificationFieldLabels {
  gatherAt: string
  gatherTime: string
  gatherLocation: string
  specialNotes: string
}

export interface SendEventNotificationOptions {
  // Admin-editable announcement line shown above the embed.
  content: string
  // 이벤트에 설정된 역할 ID. NULL 이면 멘션 없이 채널에만 올린다.
  notifyRoleId: string | null
  // 최종 전송 채널 ID. 호출부가 event.notify_channel_id ?? tenant.event_channel_id
  // 로 미리 해석해서 넘긴다. 빈 값이면 여기서 throw — 봇 알림은 조용한 실패로
  // 덮어놓으면 운영자가 "왜 안 오지" 하는 시간이 길어진다.
  channelId: string | null
  // Discord embed 필드 라벨 — 알림을 트리거하는 관리자 locale 로 결정.
  // 채널 메시지는 다국적 채널이라도 단일 라벨로 내보내야 하므로 호출자 locale 사용.
  fieldLabels: EventNotificationFieldLabels
  // 날짜 포맷용 locale (BCP 47, e.g. 'ko-KR' / 'ja-JP' / 'en-US').
  dateLocale: string
}

export async function sendEventNotification(
  event: EventNotificationPayload,
  options: SendEventNotificationOptions,
): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const appUrl = process.env.APP_URL
  const channelId = options.channelId
  if (!botToken || !channelId || !appUrl) {
    throw new Error('Discord bot notification not configured (DISCORD_BOT_TOKEN/APP_URL env + tenant event_channel_id)')
  }

  const siteUrl = appUrl.replace(/\/$/, '')
  const eventUrl = `${siteUrl}/events/${event.id}`
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: options.fieldLabels.gatherAt, value: formatGatherAt(event.gather_at, options.dateLocale), inline: true },
    { name: options.fieldLabels.gatherTime, value: event.gather_time, inline: true },
  ]
  // gather_location 은 옵션. 비어 있으면 Discord embed 의 빈 string 거부 + UX
  // 노이즈 방지를 위해 통째로 생략.
  if (event.gather_location && event.gather_location.trim()) {
    fields.push({ name: options.fieldLabels.gatherLocation, value: event.gather_location, inline: false })
  }
  if (event.special_notes && event.special_notes.trim()) {
    fields.push({ name: options.fieldLabels.specialNotes, value: event.special_notes, inline: false })
  }

  const embed = {
    title: event.title,
    url: eventUrl,
    // Discord blurple
    color: 0x5865f2,
    fields,
    timestamp: new Date().toISOString(),
  }

  // 역할 멘션 전략:
  //   - notify_role_id 지정: `<@&id>` 로 해당 역할만 태그하고 allowed_mentions
  //     로 허용 역할을 좁힌다. @everyone 스팸 대신 선택된 역할만 ping.
  //   - NULL: 멘션 없이 채널 메시지만. 기존처럼 모든 멤버에게 ping 하지 않는다.
  const mentionLine = options.notifyRoleId ? `<@&${options.notifyRoleId}>\n` : ''
  const content = `${mentionLine}${options.content}\n${siteUrl}`

  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      embeds: [embed],
      allowed_mentions: options.notifyRoleId
        ? { roles: [options.notifyRoleId] }
        : { parse: [] },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord channel message failed (${res.status}): ${text}`)
  }
}

// 길드 멤버 닉네임 변경. 온보딩 인증 성공 시 알비온 닉네임으로 동기화하려고
// 쓴다. 봇이 MANAGE_NICKNAMES 권한 + 대상 유저보다 높은 역할을 가져야 하고,
// 길드 소유자 닉은 못 바꾼다. 실패해도 호출부에서 삼키도록 throw — 온보딩
// 플로우 자체가 실패하는 건 부적절.
export async function changeGuildMemberNickname(
  discordGuildId: string,
  discordUserId: string,
  nick: string,
): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) throw new Error('DISCORD_BOT_TOKEN not configured')
  // Discord 서버 닉네임은 32 자 제한. 알비온 닉은 규칙상 더 짧지만 안전하게 자름.
  const trimmed = nick.trim().slice(0, 32)
  const res = await fetch(`${DISCORD_API}/guilds/${discordGuildId}/members/${discordUserId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nick: trimmed }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Discord nickname change failed (${res.status}): ${text}`)
  }
}
