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

// Server-side batch lookup. Reads from the `guild_avatars` table populated
// on each Discord login. Missing entries return null — caller should render
// a default icon in that case.
export async function getAvatarsByDiscordIds(
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const unique = Array.from(new Set(ids))
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_avatars')
    .select('discord_id, avatar')
    .in('discord_id', unique)
  if (error || !data) return new Map()
  return new Map(data.map((row) => [row.discord_id, row.avatar ?? null]))
}

export async function upsertGuildAvatar(
  discordId: string,
  username: string,
  avatar: string | null,
  isAdmin: boolean,
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'discord_id' },
    )
}
