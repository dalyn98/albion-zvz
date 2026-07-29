'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { publicActionError } from '@/lib/public-action-error'
import { getSession } from '@/lib/session'
import { revalidatePublicShopCache } from '@/lib/shop/cache'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import {
  GUILD_BACKUP_MAX_BYTES,
  applyGuildRecovery,
  applyGuildTemplatePackage,
  exportGuildRecovery,
  exportGuildTemplatePackage,
  parseGuildRecoveryManifest,
  parseGuildTemplatePackage,
  previewGuildRecovery,
  previewGuildTemplatePackage,
  type BackupParseError,
  type GuildRecoveryPreview,
  type GuildRecoveryReceipt,
  type GuildTemplateImportPlan,
} from '@/lib/guild-backup'

export interface JsonExportResult {
  json?: string
  fileName?: string
  error?: string
}

export interface GuildRecoveryPreviewResult {
  preview?: GuildRecoveryPreview
  verifiedDigest?: string
  error?: string
}

export interface GuildRecoveryImportResult {
  receipt?: GuildRecoveryReceipt
  error?: string
}

export interface GuildTemplatePreviewResult {
  plan?: GuildTemplateImportPlan
  verifiedDigest?: string
  meta?: { createdAt: string; sourceGuildName: string | null }
  error?: string
}

export interface GuildTemplateImportResult {
  summary?: GuildTemplateImportPlan
  error?: string
}

export async function exportGuildRecoveryAction(): Promise<JsonExportResult> {
  try {
    const { db, guildId } = await adminContext()
    const tenant = await getTenantDiscordConfig(guildId)
    const manifest = await exportGuildRecovery(db, guildId)
    return {
      json: JSON.stringify(manifest),
      fileName: `${safeSlug(tenant?.slug)}-recovery-${manifest.createdAt.slice(0, 10)}.json`,
    }
  } catch (error) {
    return { error: await recoveryActionError(error, 'actions/guild-recovery-export') }
  }
}

export async function previewGuildRecoveryImportAction(
  rawJson: string,
): Promise<GuildRecoveryPreviewResult> {
  const inputError = await validateRawJsonInput(rawJson)
  if (inputError) return { error: inputError }

  try {
    const { db, guildId } = await adminContext()
    const parsedJson = safeParseJson(rawJson)
    if (!parsedJson.ok) return { error: await backupMessage('errorInvalidJson') }
    const parsed = await parseGuildRecoveryManifest(parsedJson.value)
    if (!parsed.manifest) {
      return { error: await parseErrorMessage(parsed.error ?? 'invalidFile') }
    }
    const preview = await previewGuildRecovery(db, guildId, parsed.manifest)
    return {
      preview,
      verifiedDigest: parsed.manifest.integrity.digest,
    }
  } catch (error) {
    return { error: await recoveryActionError(error, 'actions/guild-recovery-preview') }
  }
}

export async function importGuildRecoveryAction(
  rawJson: string,
  expectedDigest: string,
  idempotencyKey: string,
): Promise<GuildRecoveryImportResult> {
  const inputError = await validateRawJsonInput(rawJson)
  if (inputError) return { error: inputError }

  try {
    const { db, guildId, session } = await adminContext()
    const parsedJson = safeParseJson(rawJson)
    if (!parsedJson.ok) return { error: await backupMessage('errorInvalidJson') }
    const parsed = await parseGuildRecoveryManifest(parsedJson.value)
    if (!parsed.manifest) {
      return { error: await parseErrorMessage(parsed.error ?? 'invalidFile') }
    }
    if (parsed.manifest.integrity.digest !== expectedDigest) {
      return { error: await backupMessage('errorPreviewExpired') }
    }

    const receipt = await applyGuildRecovery(db, {
      guildId,
      manifest: parsed.manifest,
      idempotencyKey,
      actorDiscordId: session.discordId,
      actorUsername: session.username ?? null,
    })

    revalidateRecoveryPaths(guildId)
    return { receipt }
  } catch (error) {
    return { error: await recoveryActionError(error, 'actions/guild-recovery-apply') }
  }
}

export async function exportGuildTemplatePackageAction(): Promise<JsonExportResult> {
  try {
    const { db, guildId } = await adminContext()
    const tenant = await getTenantDiscordConfig(guildId)
    const templatePackage = await exportGuildTemplatePackage(
      db,
      guildId,
      tenant?.name ?? null,
    )
    return {
      json: JSON.stringify(templatePackage),
      fileName: `${safeSlug(tenant?.slug)}-templates-${templatePackage.createdAt.slice(0, 10)}.json`,
    }
  } catch (error) {
    return { error: await recoveryActionError(error, 'actions/template-package-export') }
  }
}

export async function previewGuildTemplatePackageImportAction(
  rawJson: string,
): Promise<GuildTemplatePreviewResult> {
  const inputError = await validateRawJsonInput(rawJson)
  if (inputError) return { error: inputError }

  try {
    const { db, guildId } = await adminContext()
    const parsedJson = safeParseJson(rawJson)
    if (!parsedJson.ok) return { error: await backupMessage('errorInvalidJson') }
    const parsed = await parseGuildTemplatePackage(parsedJson.value)
    if (!parsed.package) {
      return { error: await parseErrorMessage(parsed.error ?? 'invalidFile') }
    }
    return {
      plan: await previewGuildTemplatePackage(db, guildId, parsed.package),
      verifiedDigest: parsed.package.integrity.digest,
      meta: {
        createdAt: parsed.package.createdAt,
        sourceGuildName: parsed.package.source.guildName,
      },
    }
  } catch (error) {
    return { error: await recoveryActionError(error, 'actions/template-package-preview') }
  }
}

export async function importGuildTemplatePackageAction(
  rawJson: string,
  expectedDigest: string,
): Promise<GuildTemplateImportResult> {
  const inputError = await validateRawJsonInput(rawJson)
  if (inputError) return { error: inputError }

  try {
    const { db, guildId } = await adminContext()
    const parsedJson = safeParseJson(rawJson)
    if (!parsedJson.ok) return { error: await backupMessage('errorInvalidJson') }
    const parsed = await parseGuildTemplatePackage(parsedJson.value)
    if (!parsed.package) {
      return { error: await parseErrorMessage(parsed.error ?? 'invalidFile') }
    }
    if (parsed.package.integrity.digest !== expectedDigest) {
      return { error: await backupMessage('errorPreviewExpired') }
    }
    const summary = await applyGuildTemplatePackage(db, guildId, parsed.package)
    revalidatePath('/admin/dashboard/templates')
    return { summary }
  } catch (error) {
    return { error: await recoveryActionError(error, 'actions/template-package-apply') }
  }
}

async function adminContext() {
  const [db, session] = await Promise.all([requireAdmin(), getSession()])
  if (!session) throw new Error('UNAUTHORIZED')
  const guildId = await getSessionGuildId(session)
  return { db, guildId, session }
}

function revalidateRecoveryPaths(guildId: string) {
  revalidatePath('/admin/dashboard')
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/admin/dashboard/shop')
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/admin/dashboard/craft')
  revalidatePath('/admin/dashboard/inventory')
  revalidatePath('/craft/queue')
  revalidatePath('/craft/my-tasks')
  revalidatePath('/craft/orders')
  revalidatePath('/market')
  revalidatePath('/shop')
  revalidatePath('/me')
  revalidatePath('/me/requests')
  revalidatePath('/', 'layout')
  revalidatePublicShopCache(guildId)
}

async function validateRawJsonInput(rawJson: string): Promise<string | null> {
  if (typeof rawJson !== 'string' || rawJson.length === 0) {
    return backupMessage('errorEmptyFile')
  }
  if (new TextEncoder().encode(rawJson).byteLength > GUILD_BACKUP_MAX_BYTES) {
    return backupMessage('errorFileTooLarge')
  }
  return null
}

function safeParseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown }
  } catch {
    return { ok: false }
  }
}

async function parseErrorMessage(error: BackupParseError): Promise<string> {
  const key = {
    invalidFile: 'errorInvalidFile',
    invalidVersion: 'errorInvalidVersion',
    unsupportedVersion: 'errorUnsupportedVersion',
    invalidIntegrity: 'errorInvalidIntegrity',
    invalidState: 'errorInvalidState',
  }[error] as
    | 'errorInvalidFile'
    | 'errorInvalidVersion'
    | 'errorUnsupportedVersion'
    | 'errorInvalidIntegrity'
    | 'errorInvalidState'
  return backupMessage(key)
}

async function recoveryActionError(error: unknown, source: string): Promise<string> {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('GUILD_RECOVERY_SOURCE_MISMATCH')) {
    return backupMessage('errorSourceMismatch')
  }
  if (message.includes('GUILD_RECOVERY_LOGICAL_ID_REQUIRED')) {
    return backupMessage('errorLogicalGuildMissing')
  }
  if (message.includes('GUILD_RECOVERY_LOGICAL_ID_CHANGED')) {
    return backupMessage('errorLogicalGuildChanged')
  }
  if (message.includes('GUILD_RECOVERY_INTEGRITY_INVALID')) {
    return backupMessage('errorInvalidIntegrity')
  }
  if (message.includes('GUILD_RECOVERY_IDEMPOTENCY_CONFLICT')) {
    return backupMessage('errorIdempotencyConflict')
  }
  if (
    message.includes('GUILD_RECOVERY_EXPORT_NOT_RECOGNIZED') ||
    message.includes('GUILD_RECOVERY_EXPORT_REGISTRATION_CONFLICT')
  ) {
    return backupMessage('errorUnrecognizedExport')
  }
  if (message.includes('UNAUTHORIZED')) {
    const t = await getTranslations('adminActionError')
    return t('unauthorized')
  }
  return publicActionError(error, source)
}

async function backupMessage(
  key:
    | 'errorEmptyFile'
    | 'errorFileTooLarge'
    | 'errorInvalidJson'
    | 'errorInvalidFile'
    | 'errorInvalidVersion'
    | 'errorUnsupportedVersion'
    | 'errorInvalidIntegrity'
    | 'errorInvalidState'
    | 'errorPreviewExpired'
    | 'errorSourceMismatch'
    | 'errorLogicalGuildMissing'
    | 'errorLogicalGuildChanged'
    | 'errorIdempotencyConflict'
    | 'errorUnrecognizedExport',
): Promise<string> {
  const t = await getTranslations('adminBackup')
  return t(key)
}

function safeSlug(slug: string | null | undefined): string {
  return (slug ?? 'guild').replace(/[^a-z0-9-]/gi, '_').toLowerCase()
}
