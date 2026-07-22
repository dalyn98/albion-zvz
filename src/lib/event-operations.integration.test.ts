import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('event operation snapshots (mig 278-279)', () => {
  let tenant: TestTenant

  beforeEach(async () => {
    tenant = await createTestTenant('event-operations')
  })

  afterEach(async () => {
    await tenant?.cleanup()
  })

  async function createEvent(category = '전투'): Promise<string> {
    const client = getTestServiceClient()
    const eventId = crypto.randomUUID()
    const { error } = await client.from('events').insert({
      id: eventId,
      guild_id: tenant.guildId,
      title: 'Operation event',
      gather_time: '',
      gather_location: '',
      status: 'published',
      category,
    })
    expect(error).toBeNull()
    return eventId
  }

  async function createPublishedTactic(): Promise<{ boardId: string; stepId: string }> {
    const client = getTestServiceClient()
    const boardId = crypto.randomUUID()
    const stepId = crypto.randomUUID()
    const { error: boardError } = await client.from('tactic_boards').insert({
      id: boardId,
      guild_id: tenant.guildId,
      title: 'Original tactic',
      summary: 'Original summary',
      terrain_type: 'choke',
      status: 'published',
      visibility: 'guild',
      tags: ['defense'],
      created_by: 'caller-1',
      updated_by: 'caller-1',
    })
    expect(boardError).toBeNull()
    const { error: stepError } = await client.from('tactic_steps').insert({
      id: stepId,
      guild_id: tenant.guildId,
      board_id: boardId,
      step_order: 0,
      title: 'Original step',
      callout: 'Hold',
      role_callouts: { tank: 'Hold choke' },
      intent: 'Deny the entrance',
      board_state: {
        version: 1,
        canvas: { width: 1600, height: 900, terrain: 'choke', gridSize: 40 },
        objects: [],
      },
      duration_seconds: 8,
    })
    expect(stepError).toBeNull()
    return { boardId, stepId }
  }

  it('copies a published tactic immutably and can replace or clear it before battle', async () => {
    const client = getTestServiceClient()
    const eventId = await createEvent()
    const { boardId, stepId } = await createPublishedTactic()

    const { data: firstSnapshotId, error: captureError } = await client.rpc(
      'capture_event_tactic_snapshot',
      {
        p_guild_id: tenant.guildId,
        p_event_id: eventId,
        p_board_id: boardId,
        p_actor: 'caller-1',
      },
    )
    expect(captureError).toBeNull()
    expect(firstSnapshotId).toEqual(expect.any(String))

    const [{ error: boardUpdateError }, { error: stepUpdateError }] = await Promise.all([
      client
        .from('tactic_boards')
        .update({ title: 'Changed tactic', updated_at: new Date().toISOString() })
        .eq('guild_id', tenant.guildId)
        .eq('id', boardId),
      client
        .from('tactic_steps')
        .update({ title: 'Changed step' })
        .eq('guild_id', tenant.guildId)
        .eq('id', stepId),
    ])
    expect(boardUpdateError).toBeNull()
    expect(stepUpdateError).toBeNull()

    const [{ data: frozenBoard }, { data: frozenSteps }] = await Promise.all([
      client
        .from('event_tactic_snapshots')
        .select('title')
        .eq('guild_id', tenant.guildId)
        .eq('event_id', eventId)
        .single(),
      client
        .from('event_tactic_snapshot_steps')
        .select('source_step_id, title')
        .eq('guild_id', tenant.guildId)
        .eq('snapshot_id', firstSnapshotId as string),
    ])
    expect(frozenBoard?.title).toBe('Original tactic')
    expect(frozenSteps).toEqual([{ source_step_id: stepId, title: 'Original step' }])

    const { data: replacedSnapshotId, error: replaceError } = await client.rpc(
      'capture_event_tactic_snapshot',
      {
        p_guild_id: tenant.guildId,
        p_event_id: eventId,
        p_board_id: boardId,
        p_actor: 'caller-1',
      },
    )
    expect(replaceError).toBeNull()
    expect(replacedSnapshotId).not.toBe(firstSnapshotId)

    const { error: clearError } = await client.rpc('clear_event_tactic_snapshot', {
      p_guild_id: tenant.guildId,
      p_event_id: eventId,
    })
    expect(clearError).toBeNull()
    const { data: cleared } = await client
      .from('event_tactic_snapshots')
      .select('id')
      .eq('guild_id', tenant.guildId)
      .eq('event_id', eventId)
      .maybeSingle()
    expect(cleared).toBeNull()
  })

  it('bumps the board revision when a step is added or deleted', async () => {
    const client = getTestServiceClient()
    const { boardId } = await createPublishedTactic()
    const { data: initialBoard, error: initialError } = await client
      .from('tactic_boards')
      .select('updated_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', boardId)
      .single()
    expect(initialError).toBeNull()

    const secondStepId = crypto.randomUUID()
    const { error: insertError } = await client.from('tactic_steps').insert({
      id: secondStepId,
      guild_id: tenant.guildId,
      board_id: boardId,
      step_order: 1,
      title: 'Second step',
      board_state: {
        version: 1,
        canvas: { width: 1600, height: 900, terrain: 'choke', gridSize: 40 },
        objects: [],
      },
      duration_seconds: 8,
    })
    expect(insertError).toBeNull()
    const { data: insertedBoard, error: insertedError } = await client
      .from('tactic_boards')
      .select('updated_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', boardId)
      .single()
    expect(insertedError).toBeNull()
    expect(new Date(insertedBoard?.updated_at ?? 0).getTime()).toBeGreaterThan(
      new Date(initialBoard?.updated_at ?? 0).getTime(),
    )

    const { error: deleteError } = await client
      .from('tactic_steps')
      .delete()
      .eq('guild_id', tenant.guildId)
      .eq('board_id', boardId)
      .eq('id', secondStepId)
    expect(deleteError).toBeNull()
    const { data: deletedBoard, error: deletedError } = await client
      .from('tactic_boards')
      .select('updated_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', boardId)
      .single()
    expect(deletedError).toBeNull()
    expect(new Date(deletedBoard?.updated_at ?? 0).getTime()).toBeGreaterThan(
      new Date(insertedBoard?.updated_at ?? 0).getTime(),
    )
  })

  it('rejects cross-tenant, non-combat, and post-start snapshot mutations', async () => {
    const client = getTestServiceClient()
    const eventId = await createEvent()
    const nonCombatEventId = await createEvent('갱킹')
    const { boardId } = await createPublishedTactic()
    const otherTenant = await createTestTenant('event-operations-other')
    try {
      const { error: crossTenantError } = await client.rpc(
        'capture_event_tactic_snapshot',
        {
          p_guild_id: otherTenant.guildId,
          p_event_id: eventId,
          p_board_id: boardId,
          p_actor: 'caller-1',
        },
      )
      expect(crossTenantError?.message).toContain('event_not_found')

      const { error: nonCombatError } = await client.rpc(
        'capture_event_tactic_snapshot',
        {
          p_guild_id: tenant.guildId,
          p_event_id: nonCombatEventId,
          p_board_id: boardId,
          p_actor: 'caller-1',
        },
      )
      expect(nonCombatError?.message).toContain('event_tactic_not_combat')

      const { error: captureError } = await client.rpc('capture_event_tactic_snapshot', {
        p_guild_id: tenant.guildId,
        p_event_id: eventId,
        p_board_id: boardId,
        p_actor: 'caller-1',
      })
      expect(captureError).toBeNull()
      const { error: startError } = await client
        .from('events')
        .update({ battle_started_at: new Date().toISOString() })
        .eq('guild_id', tenant.guildId)
        .eq('id', eventId)
      expect(startError).toBeNull()

      const { error: replaceError } = await client.rpc('capture_event_tactic_snapshot', {
        p_guild_id: tenant.guildId,
        p_event_id: eventId,
        p_board_id: boardId,
        p_actor: 'caller-1',
      })
      expect(replaceError?.message).toContain('event_tactic_snapshot_locked')
      const { error: clearError } = await client.rpc('clear_event_tactic_snapshot', {
        p_guild_id: tenant.guildId,
        p_event_id: eventId,
      })
      expect(clearError?.message).toContain('event_tactic_snapshot_locked')

      const { error: crossTenantAarError } = await client
        .from('event_after_action_reviews')
        .insert({
          guild_id: otherTenant.guildId,
          event_id: eventId,
          summary: 'Must not cross tenants',
          updated_by: 'caller-1',
        })
      expect(crossTenantAarError).not.toBeNull()
    } finally {
      await otherTenant.cleanup()
    }
  })
})
