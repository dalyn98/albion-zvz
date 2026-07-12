import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import {
  getPlayer,
  searchPlayers,
  isAlbionServer,
  type AlbionServer,
  type GameinfoPlayer,
} from '@/lib/albion-gameinfo'
import {
  recordAlbionIdentityClaim,
  resolveAlbionIdentityRelation,
  type AlbionIdentityRelation,
  type AlbionIdentityTrustStatus,
} from '@/lib/account-albion-identity'
import { getGuild } from '@/lib/albion-gameinfo'
import { log } from '@/lib/log'

const HASH_PREFIX = 'scrypt'
const KEY_LENGTH = 64
const MAX_PASSWORD_LENGTH = 72
const MIN_INVITE_CODE_LENGTH = 6
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/
const scrypt = promisify(scryptCallback)
export const LOCAL_GUILD_ACCOUNT_DUMMY_HASH =
  'scrypt$agm-public-dummy-auth-salt$LCc6tNn9YMZjY_giuHPuTyWWsoK1qs4mMB-CjzVFyKy0MZu7AlQXQ6hnNhUu4Xa0EaA9xjb1oqpHYq1celSrnA'

export const LOCAL_ACCOUNT_SUBJECT_PREFIX = 'local:'

export interface LocalGuildAccountRow {
  id: string
  subject: string
  guild_id: string
  albion_server: AlbionServer
  albion_player_id: string | null
  albion_player_name: string
  relation: AlbionIdentityRelation
  trust_status: AlbionIdentityTrustStatus
  password_hash: string
  revoked_at: string | null
}

export function isLocalAccountSubject(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(LOCAL_ACCOUNT_SUBJECT_PREFIX)
}

export function isLocalGuildAccountRestrictedFromResources(
  session: { isLocalGuildAccount?: boolean } | null | undefined,
): boolean {
  return Boolean(session?.isLocalGuildAccount)
}

export function normalizeLocalAccountName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function isValidLocalAccountPassword(raw: string): boolean {
  return raw.length >= 8 && raw.length <= MAX_PASSWORD_LENGTH && !CONTROL_CHARACTER_PATTERN.test(raw)
}

export function isValidLocalGuildInviteCode(raw: string): boolean {
  return (
    raw.length >= MIN_INVITE_CODE_LENGTH &&
    raw.length <= MAX_PASSWORD_LENGTH &&
    !CONTROL_CHARACTER_PATTERN.test(raw)
  )
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const derived = Buffer.from((await scrypt(secret, salt, KEY_LENGTH)) as Uint8Array).toString('base64url')
  return `${HASH_PREFIX}$${salt}$${derived}`
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [prefix, salt, digest] = stored.split('$')
  if (prefix !== HASH_PREFIX || !salt || !digest) return false
  const expected = Buffer.from(digest, 'base64url')
  const actual = Buffer.from((await scrypt(secret, salt, expected.length)) as Uint8Array)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export async function localGuildAccountsEnabled(guildId: string): Promise<boolean> {
  const enabled = await getAppSetting('local_guild_accounts_enabled', 'false', guildId)
  const inviteHash = await getAppSetting('local_guild_invite_hash', '', guildId)
  return enabled === 'true' && inviteHash.trim().length > 0
}

export async function verifyGuildInviteCode(guildId: string, code: string): Promise<boolean> {
  const stored = (await getAppSetting('local_guild_invite_hash', '', guildId)).trim()
  if (!stored) return false
  return verifySecret(code, stored)
}

export async function findExactAlbionPlayer(
  server: AlbionServer,
  nickname: string,
): Promise<GameinfoPlayer | null> {
  const candidates = await searchPlayers(server, nickname, 10)
  const exact = candidates.find((p) => p.Name.toLowerCase() === nickname.toLowerCase())
  if (!exact) return null
  return getPlayer(server, exact.Id)
}

export async function resolvePlayerRelation(
  guildId: string,
  server: AlbionServer,
  player: GameinfoPlayer,
): Promise<AlbionIdentityRelation> {
  const homeGuildId = (await getAppSetting('albion_home_guild_id', '', guildId)).trim() || null
  const homeGuild = homeGuildId ? await getGuild(server, homeGuildId) : null
  return resolveAlbionIdentityRelation({
    homeGuildId,
    homeAllianceId: homeGuild?.AllianceId?.trim() || null,
    playerGuildId: player.GuildId,
    playerAllianceId: player.AllianceId ?? null,
    hasPlayerId: true,
  })
}

export async function getLocalGuildAccountBySubject(
  guildId: string,
  subject: string,
): Promise<LocalGuildAccountRow | null> {
  const { data, error } = await getAdminClient()
    .from('guild_local_accounts')
    .select('id, subject, guild_id, albion_server, albion_player_id, albion_player_name, relation, trust_status, password_hash, revoked_at')
    .eq('guild_id', guildId)
    .eq('subject', subject)
    .maybeSingle()
  if (error || !data) return null
  return data as LocalGuildAccountRow
}

export async function createLocalGuildAccount(input: {
  guildId: string
  server: AlbionServer
  player: GameinfoPlayer
  password: string
  relation: AlbionIdentityRelation
}): Promise<{ row?: LocalGuildAccountRow; error?: string }> {
  const db = getAdminClient()
  const nowIso = new Date().toISOString()
  const id = crypto.randomUUID()
  const subject = `${LOCAL_ACCOUNT_SUBJECT_PREFIX}${id}`
  const trustStatus: AlbionIdentityTrustStatus =
    input.relation === 'home_guild' ? 'trusted' : 'claimed'
  const passwordHash = await hashSecret(input.password)

  const { data, error } = await db
    .from('guild_local_accounts')
    .insert({
      id,
      guild_id: input.guildId,
      albion_server: input.server,
      albion_player_id: input.player.Id,
      albion_player_name: input.player.Name,
      current_guild_id: input.player.GuildId,
      current_guild_name: input.player.GuildName,
      current_alliance_id: input.player.AllianceId ?? null,
      current_alliance_name: input.player.AllianceName ?? null,
      relation: input.relation,
      trust_status: trustStatus,
      password_hash: passwordHash,
    })
    .select('id, subject, guild_id, albion_server, albion_player_id, albion_player_name, relation, trust_status, password_hash, revoked_at')
    .single()
  if (error) return { error: error.message }

  const verifiedAt = trustStatus === 'trusted' ? nowIso : null
  const { error: avatarError } = await db.from('guild_avatars').upsert(
    {
      guild_id: input.guildId,
      discord_id: subject,
      username: input.player.Name,
      avatar: null,
      albion_server: input.server,
      albion_player_id: input.player.Id,
      albion_nickname: input.player.Name,
      albion_guild_id: input.player.GuildId,
      albion_verified_at: verifiedAt,
      updated_at: nowIso,
    },
    { onConflict: 'guild_id,discord_id' },
  )
  if (avatarError) {
    log.warn('[local-guild-account] guild avatar upsert failed', {
      guild_id: input.guildId,
      subject,
      error: avatarError.message,
    })
  }

  await recordAlbionIdentityClaim({
    guildId: input.guildId,
    discordId: subject,
    server: input.server,
    player: input.player,
    nickname: input.player.Name,
    legacyTrusted: trustStatus === 'trusted',
    source: 'member_onboarding',
  })

  return { row: data as LocalGuildAccountRow }
}

export async function touchLocalGuildAccountLogin(guildId: string, id: string): Promise<void> {
  await getAdminClient()
    .from('guild_local_accounts')
    .update({ last_login_at: new Date().toISOString() })
    .eq('guild_id', guildId)
    .eq('id', id)
}

export function isAlbionServerOrNull(raw: string): AlbionServer | null {
  return isAlbionServer(raw) ? raw : null
}
