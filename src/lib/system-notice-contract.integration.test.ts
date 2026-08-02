import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getTestServiceClient,
  hasTestEnv,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('system notice safety contract (migration 349)', () => {
  let actor: string

  async function archiveEveryOpenNotice() {
    const client = getTestServiceClient()
    const { data, error } = await client
      .from('super_admin_notices')
      .select('id')
      .is('archived_at', null)
    expect(error).toBeNull()
    for (const row of data ?? []) {
      const result = await client.rpc('archive_super_admin_notice', {
        p_notice_id: row.id,
        p_actor_discord_id: actor,
      })
      expect(result.error).toBeNull()
    }
  }

  beforeEach(async () => {
    actor = `integration-${crypto.randomUUID()}`
    await archiveEveryOpenNotice()
  })

  afterEach(async () => {
    await archiveEveryOpenNotice()
  })

  it('requires a future expiry and rejects direct service-role writes', async () => {
    const client = getTestServiceClient()
    const direct = await client.from('super_admin_notices').insert({
      message: 'must not bypass command',
      image_url: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      purpose: 'maintenance',
      severity: 'important',
      created_by_discord_id: actor,
    })
    expect(direct.error?.code).toBe('42501')

    const missingExpiry = await client.rpc('replace_super_admin_notice', {
      p_message: 'missing expiry',
      p_image_url: null,
      p_expires_at: null,
      p_purpose: 'maintenance',
      p_severity: 'important',
      p_actor_discord_id: actor,
    })
    expect(missingExpiry.error?.message).toContain('NOTICE_FUTURE_EXPIRY_REQUIRED')
  })

  it('keeps one open notice and archives replacement with atomic audit metadata', async () => {
    const client = getTestServiceClient()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const first = await client.rpc('replace_super_admin_notice', {
      p_message: 'first integration notice',
      p_image_url: null,
      p_expires_at: expiresAt,
      p_purpose: 'incident',
      p_severity: 'critical',
      p_actor_discord_id: actor,
    })
    expect(first.error).toBeNull()

    const second = await client.rpc('replace_super_admin_notice', {
      p_message: 'second integration notice',
      p_image_url: null,
      p_expires_at: expiresAt,
      p_purpose: 'security',
      p_severity: 'important',
      p_actor_discord_id: actor,
    })
    expect(second.error).toBeNull()
    expect(second.data).toMatchObject({ replacedCount: 1 })

    const rows = await client
      .from('super_admin_notices')
      .select('id, message, purpose, severity, expires_at, archived_at')
      .eq('created_by_discord_id', actor)
      .order('created_at')
    expect(rows.error).toBeNull()
    expect(rows.data).toHaveLength(2)
    expect(rows.data?.filter((row) => row.archived_at === null)).toHaveLength(1)
    const active = rows.data?.at(-1)
    expect(active).toMatchObject({
      message: 'second integration notice',
      purpose: 'security',
      severity: 'important',
      archived_at: null,
    })
    expect(Date.parse(active?.expires_at as string)).toBe(Date.parse(expiresAt))

    const audit = await client
      .from('super_admin_audit_log')
      .select('action, details')
      .eq('super_admin_discord_id', actor)
      .eq('action', 'notice.replace')
      .order('created_at')
    expect(audit.error).toBeNull()
    expect(audit.data).toHaveLength(2)
    const latestDetails = audit.data?.at(-1)?.details as Record<string, unknown>
    expect(latestDetails).toMatchObject({
      purpose: 'security',
      severity: 'important',
      replacedCount: 1,
    })
    expect(Date.parse(latestDetails.expiresAt as string)).toBe(Date.parse(expiresAt))
    expect(latestDetails).not.toHaveProperty('message')
  })

  it('archives idempotently and writes one audit event only', async () => {
    const client = getTestServiceClient()
    const created = await client.rpc('replace_super_admin_notice', {
      p_message: 'archive once',
      p_image_url: null,
      p_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      p_purpose: 'maintenance',
      p_severity: 'important',
      p_actor_discord_id: actor,
    })
    expect(created.error).toBeNull()
    const noticeId = (created.data as { noticeId: string }).noticeId

    const first = await client.rpc('archive_super_admin_notice', {
      p_notice_id: noticeId,
      p_actor_discord_id: actor,
    })
    const retry = await client.rpc('archive_super_admin_notice', {
      p_notice_id: noticeId,
      p_actor_discord_id: actor,
    })
    expect(first.error).toBeNull()
    expect(first.data).toEqual({ changed: true })
    expect(retry.error).toBeNull()
    expect(retry.data).toEqual({ changed: false })

    const audit = await client
      .from('super_admin_audit_log')
      .select('id')
      .eq('super_admin_discord_id', actor)
      .eq('action', 'notice.archive')
    expect(audit.error).toBeNull()
    expect(audit.data).toHaveLength(1)
  })
})
