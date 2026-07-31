'use server'

import { revalidatePath } from 'next/cache'
import { CAP } from '@/lib/permissions'
import {
  getSession,
  sessionHas,
} from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  isRecentDiscordAuthentication,
  resolveTenantLifecycleAuthorization,
  workspaceLifecycleReauthHref,
} from '@/lib/tenant-lifecycle'
import { log } from '@/lib/log'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type WorkspaceLifecycleActionError =
  | 'unauthorized'
  | 'reauth_required'
  | 'invalid_input'
  | 'name_mismatch'
  | 'confirmation_required'
  | 'open_obligations'
  | 'not_requestable'
  | 'cancellation_expired'
  | 'not_found'
  | 'action_failed'

export interface WorkspaceLifecycleActionResult {
  ok: boolean
  error?: WorkspaceLifecycleActionError
  purgeAt?: string
  tenantStatus?: string
  reauthHref?: string
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message)
  }
  return ''
}

function mapLifecycleError(
  error: unknown,
): WorkspaceLifecycleActionError {
  const message = errorMessage(error)
  if (message.includes('WORKSPACE_DELETE_REAUTH_REQUIRED')) {
    return 'reauth_required'
  }
  if (message.includes('WORKSPACE_DELETE_NAME_MISMATCH')) {
    return 'name_mismatch'
  }
  if (
    message.includes('WORKSPACE_DELETE_CONFIRMATION_REQUIRED') ||
    message.includes('WORKSPACE_DELETE_RESTORE_CONFIRMATION_REQUIRED')
  ) {
    return 'confirmation_required'
  }
  if (message.includes('WORKSPACE_DELETE_BLOCKED_OPEN_OBLIGATIONS')) {
    return 'open_obligations'
  }
  if (
    message.includes('WORKSPACE_DELETE_NOT_REQUESTABLE') ||
    message.includes('WORKSPACE_DELETE_CANCELLATION_UNAVAILABLE')
  ) {
    return 'not_requestable'
  }
  if (message.includes('WORKSPACE_DELETE_CANCELLATION_EXPIRED')) {
    return 'cancellation_expired'
  }
  if (
    message.includes('WORKSPACE_DELETE_REQUEST_NOT_FOUND') ||
    message.includes('TENANT_NOT_FOUND')
  ) {
    return 'not_found'
  }
  return 'action_failed'
}

async function requireLifecycleOperator(guildId: string) {
  if (!UUID_PATTERN.test(guildId)) return null
  const signedSession = await getSession()
  if (!signedSession) return null
  const authorization = await resolveTenantLifecycleAuthorization(
    guildId,
    signedSession,
  )
  if (
    !authorization ||
    !sessionHas(authorization.session, CAP.WORKSPACE_DELETE)
  ) {
    return null
  }
  return authorization
}

export async function requestWorkspaceDeletion(input: {
  guildId: string
  expectedGuildName: string
  confirmIrreversible: boolean
  reason: string
}): Promise<WorkspaceLifecycleActionResult> {
  const guildId = input.guildId.trim()
  const expectedGuildName = input.expectedGuildName
  const reason = input.reason.trim()
  if (
    !UUID_PATTERN.test(guildId) ||
    expectedGuildName.length < 1 ||
    expectedGuildName.length > 200 ||
    reason.length > 500
  ) {
    return { ok: false, error: 'invalid_input' }
  }

  try {
    const authorization = await requireLifecycleOperator(guildId)
    if (!authorization) return { ok: false, error: 'unauthorized' }
    if (
      !isRecentDiscordAuthentication(
        authorization.session.authenticatedAt,
      )
    ) {
      return {
        ok: false,
        error: 'reauth_required',
        reauthHref: workspaceLifecycleReauthHref(guildId),
      }
    }
    const { data, error } = await getAdminClient().rpc(
      'request_tenant_deletion',
      {
        p_guild_id: guildId,
        p_actor_discord_id: authorization.session.discordId,
        p_actor_authenticated_at: new Date(
          authorization.session.authenticatedAt ?? 0,
        ).toISOString(),
        p_expected_guild_name: expectedGuildName,
        p_confirm_irreversible: input.confirmIrreversible,
        p_reason: reason || null,
      },
    )
    if (error) {
      const mapped = mapLifecycleError(error)
      if (mapped === 'action_failed') {
        log.error('[tenant-lifecycle] request failed', error, {
          tenant_id: guildId,
        })
      }
      return { ok: false, error: mapped }
    }
    revalidatePath('/admin/dashboard/settings')
    revalidatePath(`/onboard/setup/${guildId}`)
    return {
      ok: true,
      purgeAt:
        typeof data?.purge_at === 'string'
          ? data.purge_at
          : undefined,
      reauthHref: workspaceLifecycleReauthHref(guildId),
    }
  } catch (error) {
    log.error('[tenant-lifecycle] request exception', error, {
      tenant_id: guildId,
    })
    return { ok: false, error: 'action_failed' }
  }
}

export async function cancelWorkspaceDeletion(input: {
  guildId: string
  requestId: string
  expectedGuildName: string
  confirmRestore: boolean
}): Promise<WorkspaceLifecycleActionResult> {
  const guildId = input.guildId.trim()
  const requestId = input.requestId.trim()
  if (
    !UUID_PATTERN.test(guildId) ||
    !UUID_PATTERN.test(requestId) ||
    input.expectedGuildName.length < 1 ||
    input.expectedGuildName.length > 200
  ) {
    return { ok: false, error: 'invalid_input' }
  }

  try {
    const authorization = await requireLifecycleOperator(guildId)
    if (!authorization) return { ok: false, error: 'unauthorized' }
    if (
      !isRecentDiscordAuthentication(
        authorization.session.authenticatedAt,
      )
    ) {
      return {
        ok: false,
        error: 'reauth_required',
        reauthHref: workspaceLifecycleReauthHref(guildId),
      }
    }
    const { data, error } = await getAdminClient().rpc(
      'cancel_tenant_deletion',
      {
        p_request_id: requestId,
        p_actor_discord_id: authorization.session.discordId,
        p_actor_authenticated_at: new Date(
          authorization.session.authenticatedAt ?? 0,
        ).toISOString(),
        p_expected_guild_name: input.expectedGuildName,
        p_confirm_restore: input.confirmRestore,
      },
    )
    if (error) {
      const mapped = mapLifecycleError(error)
      if (mapped === 'action_failed') {
        log.error('[tenant-lifecycle] cancellation failed', error, {
          tenant_id: guildId,
        })
      }
      return { ok: false, error: mapped }
    }
    revalidatePath('/admin/dashboard/settings')
    revalidatePath(`/onboard/setup/${guildId}`)
    return {
      ok: true,
      tenantStatus:
        typeof data?.tenant_status === 'string'
          ? data.tenant_status
          : undefined,
    }
  } catch (error) {
    log.error('[tenant-lifecycle] cancellation exception', error, {
      tenant_id: guildId,
    })
    return { ok: false, error: 'action_failed' }
  }
}
