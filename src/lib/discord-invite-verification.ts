import 'server-only'

import { getDiscordInviteCode, toDiscordInviteUrl } from '@/lib/discord-invite-url'

const DISCORD_API = 'https://discord.com/api/v10'
const DISCORD_INVITE_LOOKUP_TIMEOUT_MS = 5_000

interface DiscordInviteResponse {
  guild?: {
    id?: unknown
  } | null
}

export type DiscordInviteVerificationResult =
  | {
      status: 'verified'
      canonicalUrl: string
      discordGuildId: string
    }
  | { status: 'invalid' }
  | {
      status: 'wrong_guild'
      discordGuildId: string
    }
  | { status: 'unavailable' }

function inviteLookupSignal(): AbortSignal | undefined {
  if (
    typeof AbortSignal === 'undefined' ||
    typeof AbortSignal.timeout !== 'function'
  ) {
    return undefined
  }
  return AbortSignal.timeout(DISCORD_INVITE_LOOKUP_TIMEOUT_MS)
}

// Discord 의 공개 Get Invite 응답에 포함된 guild.id 를 tenant 의 봇 설치 서버와
// 대조한다. URL 형식만 맞는 다른 서버 초대나 만료된 코드는 공개 CTA 로 저장하지
// 않는다. Discord 장애/429 는 기존 값을 덮지 않도록 unavailable 로 구분한다.
export async function verifyDiscordInviteForGuild(
  rawUrl: string,
  expectedDiscordGuildId: string,
  request: typeof fetch = fetch,
): Promise<DiscordInviteVerificationResult> {
  const code = getDiscordInviteCode(rawUrl)
  const canonicalUrl = toDiscordInviteUrl(rawUrl)
  if (!code || !canonicalUrl || !expectedDiscordGuildId.trim()) {
    return { status: 'invalid' }
  }

  let response: Response
  try {
    const signal = inviteLookupSignal()
    response = await request(
      `${DISCORD_API}/invites/${encodeURIComponent(code)}?with_counts=false`,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      },
    )
  } catch {
    return { status: 'unavailable' }
  }

  if (response.status === 404) return { status: 'invalid' }
  if (response.status === 429 || response.status >= 500) {
    return { status: 'unavailable' }
  }
  if (!response.ok) return { status: 'invalid' }

  let payload: DiscordInviteResponse
  try {
    payload = (await response.json()) as DiscordInviteResponse
  } catch {
    return { status: 'unavailable' }
  }

  const discordGuildId = payload.guild?.id
  if (typeof discordGuildId !== 'string' || discordGuildId.length === 0) {
    return { status: 'invalid' }
  }
  if (discordGuildId !== expectedDiscordGuildId) {
    return { status: 'wrong_guild', discordGuildId }
  }

  return {
    status: 'verified',
    canonicalUrl,
    discordGuildId,
  }
}
