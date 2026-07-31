import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'

type AdminClient = ReturnType<typeof getAdminClient>

const STORAGE_PAGE_SIZE = 100
const DB_PAGE_SIZE = 1_000
const MAX_TENANT_STORAGE_OBJECTS = 20_000
const REMOVE_CHUNK_SIZE = 100
const PREFIX_BUCKETS = [
  'landing-banners',
  'guild-profiles',
  'notice-images',
  'regear-screenshots',
  'donation-screenshots',
] as const

interface PurgeClaimRow {
  request_id: string
  guild_id: string
  claim_token: string
}

interface StorageEntry {
  name: string
  id?: string | null
  metadata?: unknown
}

export interface TenantPurgeRunResult {
  claimed: number
  purged: number
  failed: number
  storageObjectsRemoved: number
}

function isMissingBucketError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as Record<string, unknown>
  return (
    String(record.statusCode ?? '') === '404' ||
    String(record.status ?? '') === '404' ||
    String(record.message ?? '').toLowerCase().includes('bucket not found')
  )
}

function safeFailureCode(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : ''
  if (message.startsWith('storage_')) return message.slice(0, 120)
  if (message.startsWith('database_')) return message.slice(0, 120)
  return 'purge_worker_failed'
}

async function readReferencedPaths(
  db: AdminClient,
  table: 'regear_requests' | 'donation_requests',
  guildId: string,
): Promise<string[]> {
  const paths: string[] = []
  for (
    let offset = 0;
    offset < MAX_TENANT_STORAGE_OBJECTS;
    offset += DB_PAGE_SIZE
  ) {
    const { data, error } =
      table === 'regear_requests'
        ? await db
            .from('regear_requests')
            .select('screenshot_path,screenshot_path_2')
            .eq('guild_id', guildId)
            .range(offset, offset + DB_PAGE_SIZE - 1)
        : await db
            .from('donation_requests')
            .select('screenshot_path')
            .eq('guild_id', guildId)
            .range(offset, offset + DB_PAGE_SIZE - 1)
    if (error) throw new Error(`database_${table}_read_failed`)
    const rows = (data ?? []) as Array<{
      screenshot_path: string | null
      screenshot_path_2?: string | null
    }>
    for (const row of rows) {
      for (const key of ['screenshot_path', 'screenshot_path_2'] as const) {
        const value = row[key]
        if (
          typeof value === 'string' &&
          value.length > 0 &&
          value.length <= 1_024 &&
          !value.startsWith('/')
        ) {
          paths.push(value)
        }
      }
    }
    if (rows.length < DB_PAGE_SIZE) return paths
  }
  throw new Error(`database_${table}_path_limit_exceeded`)
}

async function listBucketPrefixRecursively(
  db: AdminClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = []
  const folders = [prefix]
  while (folders.length > 0) {
    const folder = folders.shift()!
    for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
      const { data, error } = await db.storage.from(bucket).list(folder, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) {
        if (isMissingBucketError(error)) return files
        throw new Error(`storage_${bucket}_list_failed`)
      }
      const entries = (data ?? []) as StorageEntry[]
      for (const entry of entries) {
        if (
          !entry.name ||
          entry.name === '.' ||
          entry.name === '..' ||
          entry.name.includes('/')
        ) {
          continue
        }
        const path = `${folder}/${entry.name}`
        if (entry.id || entry.metadata) files.push(path)
        else folders.push(path)
        if (files.length + folders.length > MAX_TENANT_STORAGE_OBJECTS) {
          throw new Error(`storage_${bucket}_object_limit_exceeded`)
        }
      }
      if (entries.length < STORAGE_PAGE_SIZE) break
    }
  }
  return files
}

async function removeBucketPaths(
  db: AdminClient,
  bucket: string,
  paths: readonly string[],
): Promise<number> {
  const unique = Array.from(new Set(paths))
  for (let index = 0; index < unique.length; index += REMOVE_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + REMOVE_CHUNK_SIZE)
    const { error } = await db.storage.from(bucket).remove(chunk)
    if (error && !isMissingBucketError(error)) {
      throw new Error(`storage_${bucket}_remove_failed`)
    }
  }
  return unique.length
}

export async function purgeTenantStorage(
  db: AdminClient,
  guildId: string,
): Promise<Record<string, number>> {
  const [legacyRegearPaths, legacyDonationPaths, ...prefixed] =
    await Promise.all([
      readReferencedPaths(db, 'regear_requests', guildId),
      readReferencedPaths(db, 'donation_requests', guildId),
      ...PREFIX_BUCKETS.map((bucket) =>
        listBucketPrefixRecursively(db, bucket, guildId),
      ),
    ])

  const receipt: Record<string, number> = {}
  for (let index = 0; index < PREFIX_BUCKETS.length; index += 1) {
    const bucket = PREFIX_BUCKETS[index]
    const exact =
      bucket === 'regear-screenshots'
        ? legacyRegearPaths
        : bucket === 'donation-screenshots'
          ? legacyDonationPaths
          : []
    receipt[bucket] = await removeBucketPaths(
      db,
      bucket,
      [...prefixed[index], ...exact],
    )
  }
  return receipt
}

export async function processDueTenantPurges(
  db: AdminClient = getAdminClient(),
): Promise<TenantPurgeRunResult> {
  const { data, error } = await db.rpc('claim_due_tenant_deletions', {
    p_limit: 5,
  })
  if (error) throw new Error('database_purge_claim_failed')
  const claims = (data ?? []) as PurgeClaimRow[]
  const result: TenantPurgeRunResult = {
    claimed: claims.length,
    purged: 0,
    failed: 0,
    storageObjectsRemoved: 0,
  }

  for (const claim of claims) {
    try {
      const storage = await purgeTenantStorage(db, claim.guild_id)
      const storageObjectsRemoved = Object.values(storage).reduce(
        (sum, count) => sum + count,
        0,
      )
      const { error: finalizeError } = await db.rpc(
        'finalize_tenant_purge',
        {
          p_request_id: claim.request_id,
          p_guild_id: claim.guild_id,
          p_claim_token: claim.claim_token,
          p_storage_receipt: {
            version: 1,
            removed: storage,
            removed_total: storageObjectsRemoved,
          },
        },
      )
      if (finalizeError) throw new Error('database_purge_finalize_failed')
      result.purged += 1
      result.storageObjectsRemoved += storageObjectsRemoved
    } catch (error) {
      result.failed += 1
      const failureCode = safeFailureCode(error)
      const { error: releaseError } = await db.rpc(
        'release_tenant_deletion_claim',
        {
          p_request_id: claim.request_id,
          p_claim_token: claim.claim_token,
          p_error: failureCode,
        },
      )
      if (releaseError) {
        log.error('[tenant-lifecycle] purge claim release failed', releaseError)
      }
      log.error('[tenant-lifecycle] tenant purge failed', error, {
        failure_code: failureCode,
      })
    }
  }
  return result
}
