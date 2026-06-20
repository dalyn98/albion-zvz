import { getAdminClient } from './supabase-admin'
import { resolveEffectiveSiteUsername } from './site-nickname-override'
export { discordAvatarUrl } from './discord-avatar-url'

// Server-side batch lookup. Reads from `guild_avatars` (populated on each
// member login) and `guests` (populated on guest signup) so slot/party views
// can render an avatar for either class of user. Missing entries return null
// and the caller falls back to a default icon. guild_id 필수 — 같은 discord_id
// 가 여러 tenant 에 존재할 수 있으므로 현재 tenant 로 격리해야 한다.
export async function getAvatarsByDiscordIds(
  guildId: string,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const unique = Array.from(new Set(ids))
  const db = getAdminClient()
  const [members, guests] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id, avatar')
      .eq('guild_id', guildId)
      .in('discord_id', unique),
    db
      .from('guests')
      .select('discord_id, avatar')
      .eq('guild_id', guildId)
      .in('discord_id', unique),
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
  guildId: string,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map()
  const unique = Array.from(new Set(ids))
  const db = getAdminClient()
  const [members, guests] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id, username')
      .eq('guild_id', guildId)
      .in('discord_id', unique),
    db
      .from('guests')
      .select('discord_id, username')
      .eq('guild_id', guildId)
      .in('discord_id', unique),
  ])
  const result = new Map<string, string | null>()
  for (const row of guests.data ?? []) result.set(row.discord_id, row.username ?? null)
  for (const row of members.data ?? []) result.set(row.discord_id, row.username ?? null)
  return result
}

export async function upsertGuildAvatar(
  guildId: string,
  discordId: string,
  username: string,
  avatar: string | null,
  isAdmin: boolean,
  isBombSquadCaller: boolean,
  options: { usernameIsEffective?: boolean } = {},
): Promise<void> {
  const db = getAdminClient()
  const siteUsername = options.usernameIsEffective
    ? username
    : await resolveEffectiveSiteUsername(discordId, username)
  await db
    .from('guild_avatars')
    .upsert(
      {
        guild_id: guildId,
        discord_id: discordId,
        username: siteUsername,
        avatar,
        is_admin: isAdmin,
        is_bomb_squad_caller: isBombSquadCaller,
        withdrawn_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'guild_id,discord_id' },
    )
}
