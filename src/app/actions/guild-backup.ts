'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import {
  applyBackupImport,
  exportGuildBackup,
  parseGuildBackup,
  previewBackupImport,
  type BackupImportPlan,
  type BackupImportSummary,
} from '@/lib/guild-backup'
import { revalidatePublicShopCache } from '@/lib/shop/cache'
import { logAdminAction } from '@/lib/admin-audit'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export interface GuildBackupExportResult {
  json?: string
  fileName?: string
  error?: string
}

export interface GuildBackupPreviewResult {
  plan?: BackupImportPlan
  meta?: { exportedAt: string; sourceGuildName: string | null; sourceGuildId: string }
  error?: string
}

export interface GuildBackupImportResult {
  summary?: BackupImportSummary
  error?: string
}

export async function exportGuildBackupAction(): Promise<GuildBackupExportResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const tenant = await getTenantDiscordConfig(guildId)
    const backup = await exportGuildBackup(db, guildId, tenant?.name ?? null)
    const slug = (tenant?.slug ?? 'guild').replace(/[^a-z0-9-]/gi, '_').toLowerCase()
    const stamp = backup.exportedAt.slice(0, 10)
    return {
      json: JSON.stringify(backup, null, 2),
      fileName: `${slug}-backup-${stamp}.json`,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function previewGuildBackupImportAction(
  rawJson: string,
): Promise<GuildBackupPreviewResult> {
  const tErr = await getTranslations('adminActionError')
  const tBackup = await getTranslations('adminBackup')
  try {
    if (typeof rawJson !== 'string' || rawJson.length === 0) {
      return { error: tBackup('errorEmptyFile') }
    }
    if (rawJson.length > MAX_FILE_SIZE_BYTES) {
      return { error: tBackup('errorFileTooLarge') }
    }

    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const parsed = safeParseJson(rawJson)
    if (!parsed.ok) return { error: tBackup('errorInvalidJson') }

    const { backup, error } = parseGuildBackup(parsed.value)
    if (error || !backup) {
      return { error: tBackup(`errorBackup_${error ?? 'invalidFile'}` as 'errorInvalidFile') }
    }

    const plan = await previewBackupImport(db, guildId, backup)
    return {
      plan,
      meta: {
        exportedAt: backup.exportedAt,
        sourceGuildName: backup.sourceGuildName,
        sourceGuildId: backup.sourceGuildId,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function importGuildBackupAction(
  rawJson: string,
): Promise<GuildBackupImportResult> {
  const tErr = await getTranslations('adminActionError')
  const tBackup = await getTranslations('adminBackup')
  try {
    if (typeof rawJson !== 'string' || rawJson.length === 0) {
      return { error: tBackup('errorEmptyFile') }
    }
    if (rawJson.length > MAX_FILE_SIZE_BYTES) {
      return { error: tBackup('errorFileTooLarge') }
    }

    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const parsed = safeParseJson(rawJson)
    if (!parsed.ok) return { error: tBackup('errorInvalidJson') }

    const { backup, error } = parseGuildBackup(parsed.value)
    if (error || !backup) {
      return { error: tBackup(`errorBackup_${error ?? 'invalidFile'}` as 'errorInvalidFile') }
    }

    const summary = await applyBackupImport(
      db,
      {
        guildId,
        handledBy: session.discordId,
        handledByUsername: session.username ?? null,
      },
      backup,
    )

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'backup.import',
      targetKind: 'guild_backup',
      details: {
        sourceGuildId: backup.sourceGuildId,
        sourceGuildName: backup.sourceGuildName,
        exportedAt: backup.exportedAt,
        summary,
      },
    })

    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/shop')
    revalidatePath('/admin/dashboard/templates')
    revalidatePublicShopCache(guildId)
    revalidatePath('/shop')
    revalidatePath('/me')
    revalidatePath('/me/profile')
    revalidatePath('/', 'layout')
    return { summary }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false }
  }
}
