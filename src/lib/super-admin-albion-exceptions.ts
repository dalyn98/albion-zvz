import 'server-only'

import { z } from 'zod'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { isMissingAlbionResourceExceptionTable } from '@/lib/albion-identity-resource-exception'
import { getAdminClient } from '@/lib/supabase-admin'

const discordIdSchema = z.string().trim().regex(/^[0-9]{15,25}$/)
const mutationSchema = z.object({
  guildId: z.string().uuid(),
  discordId: discordIdSchema,
  reason: z.string().trim().min(3).max(500),
})
const grantMutationSchema = mutationSchema.extend({
  actorDiscordId: discordIdSchema,
})

export interface SuperAdminAlbionExceptionTenantOption {
  id: string
  name: string
  slug: string
  status: string
}

export interface SuperAdminAlbionResourceExceptionRow {
  guildId: string
  tenantName: string
  tenantSlug: string
  discordId: string
  server: AlbionServer
  playerId: string
  playerName: string
  reason: string
  grantedByDiscordId: string
  grantedAt: string
  updatedAt: string
  currentBindingMatches: boolean
  currentRelation: string | null
  currentGuildName: string | null
}

export interface SuperAdminAlbionExceptionSnapshot {
  storeAvailable: boolean
  tenants: SuperAdminAlbionExceptionTenantOption[]
  exceptions: SuperAdminAlbionResourceExceptionRow[]
}

export interface AlbionResourceExceptionMutationResult {
  guildId: string
  discordId: string
  server: AlbionServer
  playerId: string
  playerName: string
  reason: string
}

interface ExceptionRow {
  guild_id: string
  discord_id: string
  albion_server: AlbionServer
  albion_player_id: string
  albion_player_name: string
  reason: string
  granted_by_discord_id: string
  granted_at: string
  updated_at: string
}

export async function listSuperAdminAlbionResourceExceptions(): Promise<
  SuperAdminAlbionExceptionSnapshot
> {
  const db = getAdminClient()
  const [tenantResult, exceptionResult] = await Promise.all([
    db
      .from('tenants')
      .select('id, name, slug, status')
      .neq('status', 'deleted')
      .order('name', { ascending: true }),
    db
      .from('albion_identity_resource_exceptions')
      .select(
        'guild_id, discord_id, albion_server, albion_player_id, albion_player_name, reason, granted_by_discord_id, granted_at, updated_at',
      )
      .order('updated_at', { ascending: false }),
  ])

  if (tenantResult.error) {
    throw new Error(`테넌트 조회 실패: ${tenantResult.error.message}`)
  }
  const tenants = (tenantResult.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    status: row.status as string,
  }))

  if (isMissingAlbionResourceExceptionTable(exceptionResult.error)) {
    return { storeAvailable: false, tenants, exceptions: [] }
  }
  if (exceptionResult.error) {
    throw new Error(`Albion 인증 예외 조회 실패: ${exceptionResult.error.message}`)
  }

  const exceptionRows = (exceptionResult.data ?? []) as ExceptionRow[]
  const discordIds = [...new Set(exceptionRows.map((row) => row.discord_id))]
  const linkResult = discordIds.length > 0
    ? await db
        .from('account_albion_tenant_links')
        .select(
          'guild_id, discord_id, albion_server, albion_player_id, relation, trust_status, current_guild_name',
        )
        .in('discord_id', discordIds)
    : { data: [], error: null }
  if (linkResult.error) {
    throw new Error(`현재 Albion 연결 조회 실패: ${linkResult.error.message}`)
  }

  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]))
  const linkBySubject = new Map(
    (linkResult.data ?? []).map((row) => [
      `${row.guild_id}:${row.discord_id}`,
      row,
    ]),
  )
  const exceptions = exceptionRows.map((row) => {
    const tenant = tenantById.get(row.guild_id)
    const link = linkBySubject.get(`${row.guild_id}:${row.discord_id}`)
    return {
      guildId: row.guild_id,
      tenantName: tenant?.name ?? row.guild_id,
      tenantSlug: tenant?.slug ?? 'unknown',
      discordId: row.discord_id,
      server: row.albion_server,
      playerId: row.albion_player_id,
      playerName: row.albion_player_name,
      reason: row.reason,
      grantedByDiscordId: row.granted_by_discord_id,
      grantedAt: row.granted_at,
      updatedAt: row.updated_at,
      currentBindingMatches:
        link?.trust_status !== 'revoked' &&
        link?.albion_server === row.albion_server &&
        link?.albion_player_id === row.albion_player_id,
      currentRelation: (link?.relation as string | null | undefined) ?? null,
      currentGuildName:
        (link?.current_guild_name as string | null | undefined) ?? null,
    }
  })

  return { storeAvailable: true, tenants, exceptions }
}

export async function grantAlbionIdentityResourceException(input: {
  guildId: string
  discordId: string
  reason: string
  actorDiscordId: string
}): Promise<AlbionResourceExceptionMutationResult> {
  const parsed = grantMutationSchema.safeParse(input)
  if (!parsed.success) throw new Error('테넌트, Discord ID, 사유를 확인하세요.')

  const db = getAdminClient()
  const { data: link, error: linkError } = await db
    .from('account_albion_tenant_links')
    .select(
      'albion_server, albion_player_id, albion_player_name, revoked_at',
    )
    .eq('guild_id', parsed.data.guildId)
    .eq('discord_id', parsed.data.discordId)
    .maybeSingle()
  if (linkError) throw new Error(`Albion 연결 조회 실패: ${linkError.message}`)
  if (
    !link ||
    link.revoked_at ||
    !isAlbionServer(link.albion_server) ||
    typeof link.albion_player_id !== 'string' ||
    !link.albion_player_id.trim() ||
    typeof link.albion_player_name !== 'string' ||
    !link.albion_player_name.trim()
  ) {
    throw new Error('현재 활성 Albion 캐릭터 연결이 있는 사용자만 예외 처리할 수 있습니다.')
  }

  const nowIso = new Date().toISOString()
  const row = {
    guild_id: parsed.data.guildId,
    discord_id: parsed.data.discordId,
    albion_server: link.albion_server,
    albion_player_id: link.albion_player_id,
    albion_player_name: link.albion_player_name.trim(),
    reason: parsed.data.reason,
    granted_by_discord_id: parsed.data.actorDiscordId,
    granted_at: nowIso,
    updated_at: nowIso,
  }
  const { error } = await db
    .from('albion_identity_resource_exceptions')
    .upsert(row, { onConflict: 'guild_id,discord_id' })
  if (error) throw new Error(`Albion 인증 예외 저장 실패: ${error.message}`)

  return {
    guildId: parsed.data.guildId,
    discordId: parsed.data.discordId,
    server: link.albion_server,
    playerId: link.albion_player_id,
    playerName: link.albion_player_name.trim(),
    reason: parsed.data.reason,
  }
}

export async function revokeAlbionIdentityResourceException(input: {
  guildId: string
  discordId: string
  reason: string
}): Promise<AlbionResourceExceptionMutationResult> {
  const parsed = mutationSchema.safeParse(input)
  if (!parsed.success) throw new Error('테넌트, Discord ID, 해제 사유를 확인하세요.')

  const db = getAdminClient()
  const { data: existing, error: lookupError } = await db
    .from('albion_identity_resource_exceptions')
    .select('albion_server, albion_player_id, albion_player_name, reason')
    .eq('guild_id', parsed.data.guildId)
    .eq('discord_id', parsed.data.discordId)
    .maybeSingle()
  if (lookupError) throw new Error(`Albion 인증 예외 조회 실패: ${lookupError.message}`)
  if (!existing || !isAlbionServer(existing.albion_server)) {
    throw new Error('해제할 Albion 인증 예외가 없습니다.')
  }

  const { data: deleted, error } = await db
    .from('albion_identity_resource_exceptions')
    .delete()
    .eq('guild_id', parsed.data.guildId)
    .eq('discord_id', parsed.data.discordId)
    .eq('albion_server', existing.albion_server)
    .eq('albion_player_id', existing.albion_player_id)
    .select('guild_id')
    .maybeSingle()
  if (error) throw new Error(`Albion 인증 예외 해제 실패: ${error.message}`)
  if (!deleted) {
    throw new Error('예외가 동시에 변경되었습니다. 목록을 새로고침한 뒤 다시 시도하세요.')
  }

  return {
    guildId: parsed.data.guildId,
    discordId: parsed.data.discordId,
    server: existing.albion_server,
    playerId: existing.albion_player_id as string,
    playerName: existing.albion_player_name as string,
    reason: parsed.data.reason,
  }
}
