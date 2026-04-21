// Discord OAuth2 + guild-member role check.
//
// Flow: redirect user to Discord with `identify guilds.members.read`, exchange
// the returned code for a bearer token, then read the user's member object
// in *our* guild to confirm they actually belong and carry the right role.
// `guilds.members.read` is the scope that lets us fetch roles without a bot.

const DISCORD_API = 'https://discord.com/api/v10'
const OAUTH_SCOPES = 'identify guilds.members.read'

export interface DiscordUser {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
}

export interface DiscordGuildMember {
  user?: DiscordUser
  nick: string | null
  roles: string[]
}

export interface DiscordConfig {
  clientId: string
  clientSecret: string
  guildId: string
  // Both role-id env vars accept a comma-separated list. A user is counted as
  // member/admin if they hold ANY of the listed roles. Trailing/leading space
  // and empty entries are tolerated so `a, b ,` still parses cleanly.
  memberRoleIds: string[]
  adminRoleIds: string[]
  redirectUri: string
}

function parseRoleIds(raw: string | undefined): string[] {
  if (!raw) return []
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

export function getDiscordConfig(): DiscordConfig {
  const clientId = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  const guildId = process.env.DISCORD_GUILD_ID
  const memberRoleIds = parseRoleIds(process.env.DISCORD_MEMBER_ROLE_ID)
  const adminRoleIds = parseRoleIds(process.env.DISCORD_ADMIN_ROLE_ID)
  const appUrl = process.env.APP_URL
  if (!clientId || !clientSecret || !guildId || memberRoleIds.length === 0 || adminRoleIds.length === 0 || !appUrl) {
    throw new Error('Discord env vars not fully set')
  }
  return {
    clientId,
    clientSecret,
    guildId,
    memberRoleIds,
    adminRoleIds,
    redirectUri: `${appUrl.replace(/\/$/, '')}/api/auth/discord/callback`,
  }
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = getDiscordConfig()
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    state,
  })
  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getDiscordConfig()
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

export async function getGuildMember(accessToken: string): Promise<DiscordGuildMember | null> {
  const { guildId } = getDiscordConfig()
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
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

export interface DiscordIdentity {
  discordId: string
  username: string
  avatar: string | null
  isMember: boolean
  isAdmin: boolean
}

export function identityFromMember(member: DiscordGuildMember): DiscordIdentity | null {
  if (!member.user) return null
  const { memberRoleIds, adminRoleIds } = getDiscordConfig()
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
}

function formatGatherAt(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toLocaleString('ko-KR', {
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

export interface SendEventNotificationOptions {
  // Admin-editable announcement line shown above the embed.
  content: string
  // 이벤트에 설정된 역할 ID. NULL 이면 멘션 없이 채널에만 올린다.
  notifyRoleId: string | null
}

export async function sendEventNotification(
  event: EventNotificationPayload,
  options: SendEventNotificationOptions,
): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const channelId = process.env.DISCORD_EVENT_CHANNEL_ID
  const appUrl = process.env.APP_URL
  if (!botToken || !channelId || !appUrl) {
    throw new Error('Discord bot notification env not set (DISCORD_BOT_TOKEN, DISCORD_EVENT_CHANNEL_ID, APP_URL)')
  }

  const siteUrl = appUrl.replace(/\/$/, '')
  const eventUrl = `${siteUrl}/events/${event.id}`
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: '집결 일시', value: formatGatherAt(event.gather_at), inline: true },
    { name: '집결 시간', value: event.gather_time, inline: true },
    { name: '집결 장소', value: event.gather_location, inline: false },
  ]
  if (event.special_notes && event.special_notes.trim()) {
    fields.push({ name: '특이사항', value: event.special_notes, inline: false })
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
