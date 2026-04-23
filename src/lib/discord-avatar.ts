import { getAdminClient } from './supabase-admin'

// Discord CDN URL format. Animated avatars use the `a_` prefix and render as
// GIFs; static avatars are PNGs.
//
// Discord CDN requires the `?size=` parameter to be a power of two between 16
// and 4096. Non-power-of-two sizes (e.g. 36 from a 36px avatar) return an error,
// which caused the member list to fall through to the UserCircle2 placeholder.
function roundUpToPowerOfTwo(size: number): number {
  if (size <= 16) return 16
  if (size <= 32) return 32
  if (size <= 64) return 64
  if (size <= 128) return 128
  if (size <= 256) return 256
  if (size <= 512) return 512
  if (size <= 1024) return 1024
  if (size <= 2048) return 2048
  return 4096
}

export function discordAvatarUrl(
  discordId: string,
  avatar: string | null | undefined,
  size = 64,
): string | null {
  if (!avatar) return null
  const ext = avatar.startsWith('a_') ? 'gif' : 'png'
  const cdnSize = roundUpToPowerOfTwo(size)
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${ext}?size=${cdnSize}`
}

// Server-side batch lookup. Reads from `guild_avatars` (populated on each
// member login) and `guests` (populated on guest signup) so slot/party views
// can render an avatar for either class of user. Missing entries return null
// and the caller falls back to a default icon.
export async function getAvatarsByDiscordIds(
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const unique = Array.from(new Set(ids))
  const db = getAdminClient()
  const [members, guests] = await Promise.all([
    db.from('guild_avatars').select('discord_id, avatar').in('discord_id', unique),
    db.from('guests').select('discord_id, avatar').in('discord_id', unique),
  ])
  const result = new Map<string, string | null>()
  // Guests first, then members — a rare dual-row (shouldn't happen) prefers
  // the member avatar which is refreshed on every login.
  for (const row of guests.data ?? []) result.set(row.discord_id, row.avatar ?? null)
  for (const row of members.data ?? []) result.set(row.discord_id, row.avatar ?? null)
  return result
}

// Username 조회용 배치 API. 콜러가 파티 슬롯에 배정되지 않아도 이름 표시
// 하려고 만들었다 — guild_avatars/guests 에서 찾고, 없으면 null.
export async function getUsernamesByDiscordIds(
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const unique = Array.from(new Set(ids))
  const db = getAdminClient()
  const [members, guests] = await Promise.all([
    db.from('guild_avatars').select('discord_id, username').in('discord_id', unique),
    db.from('guests').select('discord_id, username').in('discord_id', unique),
  ])
  const result = new Map<string, string | null>()
  for (const row of guests.data ?? []) result.set(row.discord_id, row.username ?? null)
  for (const row of members.data ?? []) result.set(row.discord_id, row.username ?? null)
  return result
}

export async function upsertGuildAvatar(
  discordId: string,
  username: string,
  avatar: string | null,
  isAdmin: boolean,
  isBombSquadCaller: boolean,
): Promise<void> {
  const db = getAdminClient()
  await db
    .from('guild_avatars')
    .upsert(
      {
        discord_id: discordId,
        username,
        avatar,
        is_admin: isAdmin,
        is_bomb_squad_caller: isBombSquadCaller,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'discord_id' },
    )
}
