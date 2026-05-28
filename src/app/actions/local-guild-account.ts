'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireAnyCapability } from '@/lib/auth'
import { getSession, SESSION_COOKIE_NAME, cookieOptions, signSession, type SessionPayload } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { resolveTenantBySlug, classifyHost } from '@/lib/tenant-resolver'
import { CAP } from '@/lib/permissions'
import { getAppSetting } from '@/lib/app-settings'
import { LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/locales'
import { localeCookieOptions } from '@/lib/locale-cookie'
import { logAdminAction } from '@/lib/admin-audit'
import {
  createLocalGuildAccount,
  findExactAlbionPlayer,
  hashSecret,
  isLocalAccountSubject,
  isAlbionServerOrNull,
  isValidLocalAccountPassword,
  localGuildAccountsEnabled,
  normalizeLocalAccountName,
  resolvePlayerRelation,
  touchLocalGuildAccountLogin,
  verifyGuildInviteCode,
  verifySecret,
  type LocalGuildAccountRow,
} from '@/lib/local-guild-account'

export interface LocalGuildAccountSummary {
  id: string
  subject: string
  server: string
  nickname: string
  relation: string
  trustStatus: string
  createdAt: string | null
  lastLoginAt: string | null
  revokedAt: string | null
}

function sanitizeReturnTo(raw: string): string {
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

async function resolveTenantFromRequest(): Promise<{ guildId: string; slug: string } | null> {
  const headerStore = await headers()
  const classified = classifyHost(headerStore.get('host'))
  if (classified.kind !== 'tenant') return null
  const tenant = await resolveTenantBySlug(classified.slug)
  if (!tenant) return null
  return { guildId: tenant.tenantId, slug: tenant.slug }
}

async function issueLocalSession(input: {
  guildId: string
  subject: string
  username: string
  locale: Locale | null
}): Promise<void> {
  const session: SessionPayload = {
    discordId: input.subject,
    username: input.username,
    avatar: null,
    isMember: true,
    isAdmin: false,
    isGuest: false,
    isBombSquadCaller: false,
    isLocalGuildAccount: true,
    isAllianceCandidate: false,
    canCreateEvents: false,
    eventCreatorCategories: [],
    eventScope: null,
    guildId: input.guildId,
    capabilities: '0',
    issuedAt: Date.now(),
  }
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  cookieStore.set(SESSION_COOKIE_NAME, await signSession(session), cookieOptions())
  if (input.locale) {
    cookieStore.set(LOCALE_COOKIE, input.locale, localeCookieOptions(headerStore.get('host')))
  }
}

export async function registerLocalGuildAccount(input: {
  server: string
  nickname: string
  password: string
  guildCode: string
  locale: string
  returnTo: string
}): Promise<{ ok?: true; redirectTo?: string; error?: string }> {
  const t = await getTranslations('localGuildAccount')
  const tenant = await resolveTenantFromRequest()
  if (!tenant) return { error: t('tenantRequired') }
  if (!(await localGuildAccountsEnabled(tenant.guildId))) return { error: t('disabled') }
  const server = isAlbionServerOrNull(input.server)
  if (!server) return { error: t('invalidServer') }
  const nickname = normalizeLocalAccountName(input.nickname)
  if (nickname.length < 2 || nickname.length > 32) return { error: t('invalidNickname') }
  if (!isValidLocalAccountPassword(input.password)) return { error: t('invalidPassword') }
  if (!(await verifyGuildInviteCode(tenant.guildId, input.guildCode))) {
    return { error: t('invalidGuildCode') }
  }

  const player = await findExactAlbionPlayer(server, nickname)
  if (!player) return { error: t('playerNotFound') }

  const relation = await resolvePlayerRelation(tenant.guildId, server, player)
  const created = await createLocalGuildAccount({
    guildId: tenant.guildId,
    server,
    player,
    password: input.password,
    relation,
  })
  if (created.error || !created.row) {
    return { error: created.error?.includes('duplicate') ? t('duplicateAccount') : created.error ?? t('saveFailed') }
  }
  const locale = isLocale(input.locale) ? input.locale : null
  await issueLocalSession({
    guildId: tenant.guildId,
    subject: created.row.subject,
    username: created.row.albion_player_name,
    locale,
  })
  await touchLocalGuildAccountLogin(created.row.id)
  revalidatePath('/')
  return { ok: true, redirectTo: sanitizeReturnTo(input.returnTo) }
}

export async function loginLocalGuildAccount(input: {
  server: string
  nickname: string
  password: string
  locale: string
  returnTo: string
}): Promise<{ ok?: true; redirectTo?: string; error?: string }> {
  const t = await getTranslations('localGuildAccount')
  const tenant = await resolveTenantFromRequest()
  if (!tenant) return { error: t('tenantRequired') }
  if (!(await localGuildAccountsEnabled(tenant.guildId))) return { error: t('disabled') }
  const server = isAlbionServerOrNull(input.server)
  if (!server) return { error: t('invalidServer') }
  const nickname = normalizeLocalAccountName(input.nickname)
  if (!nickname || !input.password) return { error: t('invalidLogin') }

  const { data, error } = await getAdminClient()
    .from('guild_local_accounts')
    .select('id, subject, guild_id, albion_server, albion_player_id, albion_player_name, relation, trust_status, password_hash, revoked_at')
    .eq('guild_id', tenant.guildId)
    .eq('albion_server', server)
    .eq('albion_player_name', nickname)
    .is('revoked_at', null)
    .maybeSingle()
  if (error || !data) return { error: t('invalidLogin') }
  const row = data as LocalGuildAccountRow
  if (!row || row.trust_status === 'revoked' || !verifySecret(input.password, row.password_hash)) {
    return { error: t('invalidLogin') }
  }

  const locale = isLocale(input.locale) ? input.locale : null
  await issueLocalSession({
    guildId: tenant.guildId,
    subject: row.subject,
    username: row.albion_player_name,
    locale,
  })
  await touchLocalGuildAccountLogin(row.id)
  return { ok: true, redirectTo: sanitizeReturnTo(input.returnTo) }
}

export async function updateLocalGuildAccountSettings(input: {
  enabled: boolean
  guildCode: string
}): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const db = await requireAnyCapability([CAP.SETTINGS_GENERAL])
  const session = await getSession()
  if (!session) return { error: tErr('serverError') }
  const guildId = await getSessionGuildId(session)
  const existingHash = (await getAppSetting('local_guild_invite_hash', '', guildId)).trim()
  const trimmedCode = input.guildCode.trim()
  if (input.enabled && !existingHash && trimmedCode.length < 6) {
    return { error: tErr('emptyValue') }
  }
  if (trimmedCode && (trimmedCode.length < 6 || trimmedCode.length > 72)) {
    return { error: tErr('invalidInput') }
  }
  const nowIso = new Date().toISOString()
  const rows = [
    {
      guild_id: guildId,
      key: 'local_guild_accounts_enabled',
      value: input.enabled ? 'true' : 'false',
      updated_at: nowIso,
    },
  ]
  if (trimmedCode) {
    rows.push({
      guild_id: guildId,
      key: 'local_guild_invite_hash',
      value: hashSecret(trimmedCode),
      updated_at: nowIso,
    })
  }
  const { error } = await db.from('app_settings').upsert(rows, { onConflict: 'guild_id,key' })
  if (error) return { error: error.message }
  await logAdminAction({
    guildId,
    adminDiscordId: session.discordId,
    action: 'settings.update',
    targetKind: 'setting',
    details: {
      kind: 'local_guild_accounts',
      enabled: input.enabled,
      inviteCodeRotated: !!trimmedCode,
    },
  })
  revalidatePath('/admin/dashboard/settings')
  revalidatePath('/', 'layout')
  return {}
}

function mapLocalGuildAccountRow(row: Record<string, unknown>): LocalGuildAccountSummary {
  return {
    id: row.id as string,
    subject: row.subject as string,
    server: row.albion_server as string,
    nickname: row.albion_player_name as string,
    relation: row.relation as string,
    trustStatus: row.trust_status as string,
    createdAt: (row.created_at as string | null) ?? null,
    lastLoginAt: (row.last_login_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  }
}

function revalidateLocalGuildAccountSurfaces(): void {
  revalidatePath('/admin/dashboard/settings')
  revalidatePath('/events')
  revalidatePath('/regear')
  revalidatePath('/', 'layout')
}

export async function listLocalGuildAccounts(): Promise<{
  accounts: LocalGuildAccountSummary[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  const db = await requireAnyCapability([CAP.SETTINGS_GENERAL])
  const session = await getSession()
  if (!session) return { accounts: [], error: tErr('serverError') }
  const guildId = await getSessionGuildId(session)
  const { data, error } = await db
    .from('guild_local_accounts')
    .select(
      'id, subject, albion_server, albion_player_name, relation, trust_status, created_at, last_login_at, revoked_at',
    )
    .eq('guild_id', guildId)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) return { accounts: [], error: error.message }
  return { accounts: ((data ?? []) as Record<string, unknown>[]).map(mapLocalGuildAccountRow) }
}

export async function revokeLocalGuildAccount(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const db = await requireAnyCapability([CAP.SETTINGS_GENERAL])
  const session = await getSession()
  if (!session) return { error: tErr('serverError') }
  const guildId = await getSessionGuildId(session)
  const { data: account, error: accountError } = await db
    .from('guild_local_accounts')
    .select('id, subject, albion_player_name, revoked_at')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (accountError) return { error: accountError.message }
  if (!account) return { error: tErr('memberNotFound') }
  const subject = account.subject as string
  if (!isLocalAccountSubject(subject)) return { error: tErr('invalidInput') }

  const nowIso = new Date().toISOString()
  const { error } = await db
    .from('guild_local_accounts')
    .update({
      trust_status: 'revoked',
      revoked_at: (account.revoked_at as string | null) ?? nowIso,
    })
    .eq('guild_id', guildId)
    .eq('id', id)
  if (error) return { error: error.message }

  await Promise.all([
    db
      .from('guild_avatars')
      .update({
        withdrawn_at: nowIso,
        albion_verified_at: null,
        updated_at: nowIso,
      })
      .eq('guild_id', guildId)
      .eq('discord_id', subject),
    db
      .from('account_albion_tenant_links')
      .update({
        trust_status: 'revoked',
        status_reason: 'revoked',
        verified_at: null,
        trusted_at: null,
        revoked_at: nowIso,
        updated_at: nowIso,
      })
      .eq('guild_id', guildId)
      .eq('discord_id', subject),
    db
      .from('account_albion_profiles')
      .update({ revoked_at: nowIso, updated_at: nowIso })
      .eq('discord_id', subject),
  ])

  await logAdminAction({
    guildId,
    adminDiscordId: session.discordId,
    action: 'settings.update',
    targetKind: 'setting',
    targetId: id,
    targetDiscordId: subject,
    details: {
      kind: 'local_guild_account_revoke',
      nickname: account.albion_player_name,
    },
  })
  revalidateLocalGuildAccountSurfaces()
  return {}
}

export async function resetLocalGuildAccountPassword(
  id: string,
  password: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const db = await requireAnyCapability([CAP.SETTINGS_GENERAL])
  const session = await getSession()
  if (!session) return { error: tErr('serverError') }
  const trimmedPassword = password.trim()
  if (!isValidLocalAccountPassword(trimmedPassword)) return { error: tErr('invalidInput') }
  const guildId = await getSessionGuildId(session)
  const { data: account, error: accountError } = await db
    .from('guild_local_accounts')
    .select('id, subject, albion_player_name, revoked_at')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (accountError) return { error: accountError.message }
  if (!account) return { error: tErr('memberNotFound') }
  if (account.revoked_at) return { error: tErr('invalidInput') }

  const { error } = await db
    .from('guild_local_accounts')
    .update({ password_hash: hashSecret(trimmedPassword) })
    .eq('guild_id', guildId)
    .eq('id', id)
  if (error) return { error: error.message }

  await logAdminAction({
    guildId,
    adminDiscordId: session.discordId,
    action: 'settings.update',
    targetKind: 'setting',
    targetId: id,
    targetDiscordId: account.subject as string,
    details: {
      kind: 'local_guild_account_password_reset',
      nickname: account.albion_player_name,
    },
  })
  revalidateLocalGuildAccountSurfaces()
  return {}
}
