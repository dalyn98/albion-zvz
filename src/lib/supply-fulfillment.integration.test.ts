import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

const describeIntegration = hasTestEnv() ? describe : describe.skip

interface SupplyFixture {
  taskId: string
  fulfillmentId: string
  requesterId: string
  crafterId: string
}

describeIntegration('atomic crafted-regear supply fulfillment (migration 335)', () => {
  let tenant: TestTenant
  const extraTenants: TestTenant[] = []
  const requesterDiscordId = '811111111111111111'
  const crafterDiscordId = '822222222222222222'
  const adminDiscordId = '833333333333333333'

  beforeEach(async () => {
    tenant = await createTestTenant(`supply-${crypto.randomUUID().slice(0, 8)}`)
    const client = getTestServiceClient()
    const { error } = await client.from('guild_avatars').insert([
      {
        guild_id: tenant.guildId,
        discord_id: requesterDiscordId,
        username: 'Supply Requester',
        avatar: null,
        is_admin: false,
        is_crafter: false,
      },
      {
        guild_id: tenant.guildId,
        discord_id: crafterDiscordId,
        username: 'Supply Crafter',
        avatar: null,
        is_admin: false,
        is_crafter: true,
      },
      {
        guild_id: tenant.guildId,
        discord_id: adminDiscordId,
        username: 'Supply Admin',
        avatar: null,
        is_admin: true,
        is_crafter: false,
      },
    ])
    expect(error).toBeNull()
  })

  afterEach(async () => {
    for (const extra of extraTenants.splice(0)) await extra.cleanup()
    await tenant?.cleanup()
  })

  async function memberId(discordId: string, guildId = tenant.guildId): Promise<string> {
    const { data, error } = await getTestServiceClient()
      .from('guild_member_access_identities')
      .select('guild_member_id')
      .eq('guild_id', guildId)
      .eq('identity_type', 'discord')
      .eq('subject_id', discordId)
      .single()
    expect(error).toBeNull()
    return data!.guild_member_id as string
  }

  async function createSupplyTask(suffix: string): Promise<SupplyFixture> {
    const client = getTestServiceClient()
    const { data: request, error: requestError } = await client
      .from('regear_requests')
      .insert({
        guild_id: tenant.guildId,
        event_id: null,
        event_title_snapshot: `Supply ${suffix}`,
        discord_id: requesterDiscordId,
        username: 'Supply Requester',
        role_name: 'Dps',
        silver: 120_000,
        claimed_silver: 120_000,
        status: 'approved',
        fulfillment_mode: 'crafted',
        build_snapshot: {
          weapon: { id: `T8_2H_BOW_${suffix}`, name: 'Bow' },
          head: { id: `T8_HEAD_CLOTH_${suffix}`, name: 'Cloth Hood' },
          cape: { id: `T8_CAPE_${suffix}`, name: 'Cape' },
        },
        craft_included_slots: ['weapon', 'head'],
        gear_breakdown: {
          items: [
            { slot: 'weapon', price: 80_000, count: 1 },
            { slot: 'head', price: 20_000, count: 2 },
            { slot: 'cape', price: 50_000, count: 1 },
          ],
        },
      })
      .select('id')
      .single()
    expect(requestError).toBeNull()

    const { data: task, error: taskError } = await client
      .from('craft_tasks')
      .insert({
        guild_id: tenant.guildId,
        task_kind: 'regear',
        regear_request_id: request!.id,
        status: 'queued',
      })
      .select('id')
      .single()
    expect(taskError).toBeNull()

    const { data: fulfillment, error: fulfillmentError } = await client
      .from('supply_fulfillments')
      .select('id, status, requester_member_id')
      .eq('guild_id', tenant.guildId)
      .eq('craft_task_id', task!.id)
      .single()
    expect(fulfillmentError).toBeNull()
    expect(fulfillment?.status).toBe('queued')
    expect(fulfillment?.requester_member_id).toBe(await memberId(requesterDiscordId))

    return {
      taskId: task!.id as string,
      fulfillmentId: fulfillment!.id as string,
      requesterId: await memberId(requesterDiscordId),
      crafterId: await memberId(crafterDiscordId),
    }
  }

  async function claim(
    fixture: SupplyFixture,
    materialSource: 'guild_stock' | 'crafter_purchase',
    feeMode: 'none' | 'configured',
    feePct: number,
  ) {
    const operationId = crypto.randomUUID()
    return getTestServiceClient().rpc('claim_supply_craft_task', {
      p_task_id: fixture.taskId,
      p_guild_id: tenant.guildId,
      p_crafter_discord_id: crafterDiscordId,
      p_crafter_username: 'Supply Crafter',
      p_material_source: materialSource,
      p_craft_fee_mode: feeMode,
      p_craft_fee_pct: feePct,
      p_idempotency_key: operationId,
      p_correlation_id: operationId,
    })
  }

  async function deliver(fixture: SupplyFixture, boxNumber: number, idempotencyKey: string) {
    return getTestServiceClient().rpc('execute_supply_craft_delivery', {
      p_guild_id: tenant.guildId,
      p_idempotency_key: idempotencyKey,
      p_correlation_id: idempotencyKey,
      p_actor_discord_id: crafterDiscordId,
      p_actor_username: 'Supply Crafter',
      p_source: 'web',
      p_request_payload: { taskId: fixture.taskId, boxNumber },
      p_execution_payload: { followupDays: 7 },
      p_confirmation_token: null,
    })
  }

  it('freezes all four material-source and craft-fee combinations at claim', async () => {
    const cases = [
      ['guild_stock', 'none', 0, 0, 0] as const,
      ['crafter_purchase', 'none', 0, 120_000, 120_000] as const,
      ['guild_stock', 'configured', 10, 0, 12_000] as const,
      ['crafter_purchase', 'configured', 10, 120_000, 132_000] as const,
    ]

    for (const [source, feeMode, pct, material, total] of cases) {
      const fixture = await createSupplyTask(`${source}-${feeMode}`)
      const result = await claim(fixture, source, feeMode, pct)
      expect(result.error).toBeNull()
      expect(result.data).toMatchObject({
        status: 'in_progress',
        quotedMaterialValueSilver: 120_000,
        materialReimbursementSilver: material,
        craftFeeSilver: total - material,
        settlementTotalSilver: total,
      })

      const { data: frozen, error } = await getTestServiceClient()
        .from('supply_fulfillments')
        .select(
          'status, material_source, craft_fee_mode, quoted_material_value_silver, material_reimbursement_silver, craft_fee_silver, settlement_total_silver, settlement_terms_accepted_at, snapshot',
        )
        .eq('guild_id', tenant.guildId)
        .eq('id', fixture.fulfillmentId)
        .single()
      expect(error).toBeNull()
      expect(frozen).toMatchObject({
        status: 'in_progress',
        material_source: source,
        craft_fee_mode: feeMode,
        quoted_material_value_silver: 120_000,
        material_reimbursement_silver: material,
        craft_fee_silver: total - material,
        settlement_total_silver: total,
      })
      expect(frozen?.settlement_terms_accepted_at).not.toBeNull()
      expect(frozen?.snapshot).toMatchObject({
        materialSource: source,
        craftFeeMode: feeMode,
        craftFeePct: pct,
      })
    }
  })

  it('releases a claimed task idempotently and clears its frozen terms', async () => {
    const client = getTestServiceClient()
    const fixture = await createSupplyTask('release')
    expect((await claim(fixture, 'crafter_purchase', 'configured', 10)).error).toBeNull()

    const releaseId = crypto.randomUUID()
    const releaseArgs = {
      p_task_id: fixture.taskId,
      p_guild_id: tenant.guildId,
      p_crafter_discord_id: crafterDiscordId,
      p_idempotency_key: releaseId,
      p_correlation_id: releaseId,
    }
    const released = await client.rpc('release_supply_craft_task', releaseArgs)
    const replay = await client.rpc('release_supply_craft_task', releaseArgs)
    expect(released.error).toBeNull()
    expect(released.data).toMatchObject({ status: 'queued', replayed: false })
    expect(replay.error).toBeNull()
    expect(replay.data).toMatchObject({ status: 'queued', replayed: true })

    const [task, fulfillment, events] = await Promise.all([
      client
        .from('craft_tasks')
        .select('status, crafter_discord_id, premium_silver, claimed_at')
        .eq('guild_id', tenant.guildId)
        .eq('id', fixture.taskId)
        .single(),
      client
        .from('supply_fulfillments')
        .select(
          'status, crafter_member_id, material_source, craft_fee_mode, quoted_material_value_silver, settlement_total_silver, settlement_terms_accepted_at',
        )
        .eq('guild_id', tenant.guildId)
        .eq('id', fixture.fulfillmentId)
        .single(),
      client
        .from('supply_fulfillment_events')
        .select('event_type')
        .eq('guild_id', tenant.guildId)
        .eq('fulfillment_id', fixture.fulfillmentId)
        .eq('event_type', 'craft_released'),
    ])
    expect(task.error).toBeNull()
    expect(task.data).toEqual({
      status: 'queued',
      crafter_discord_id: null,
      premium_silver: 0,
      claimed_at: null,
    })
    expect(fulfillment.error).toBeNull()
    expect(fulfillment.data).toEqual({
      status: 'queued',
      crafter_member_id: null,
      material_source: 'not_applicable',
      craft_fee_mode: 'not_applicable',
      quoted_material_value_silver: 0,
      settlement_total_silver: 0,
      settlement_terms_accepted_at: null,
    })
    expect(events.data).toHaveLength(1)
  })

  it('delivers atomically, prevents replay duplication, batches settlement, and collects independently', async () => {
    const client = getTestServiceClient()
    const fixture = await createSupplyTask('atomic')
    const claimResult = await claim(fixture, 'crafter_purchase', 'configured', 10)
    expect(claimResult.error).toBeNull()

    const weaponId = 'T8_2H_BOW_atomic'
    const headId = 'T8_HEAD_CLOTH_atomic'
    const stockInsert = await client.from('guild_inventory_gear').insert({
      guild_id: tenant.guildId,
      item_id: weaponId,
      quantity: 1,
      updated_by_discord_id: adminDiscordId,
    })
    expect(stockInsert.error).toBeNull()

    const commandId = crypto.randomUUID()
    const first = await deliver(fixture, 1, commandId)
    const replay = await deliver(fixture, 1, commandId)
    expect(first.error).toBeNull()
    expect(replay.error).toBeNull()
    expect(first.data).toMatchObject({
      status: 'ready_for_pickup',
      settlementTotalSilver: 132_000,
      reimbursementMode: 'paid',
      inventoryWarned: true,
      replayed: false,
    })
    expect(first.data.warnedItemIds).toContain(headId)
    expect(replay.data).toMatchObject({ reimbursementMode: 'paid', replayed: true })

    const [inventory, movements, outside, settlement, audit, outbox, run] = await Promise.all([
      client.from('guild_inventory_gear').select('quantity').eq('guild_id', tenant.guildId).eq('item_id', weaponId).single(),
      client.from('guild_inventory_movements').select('delta, reason').eq('guild_id', tenant.guildId).eq('reference_id', fixture.fulfillmentId).eq('reason', 'craft_delivery'),
      client.from('supply_outside_stock_fulfillments').select('item_id, quantity').eq('guild_id', tenant.guildId).eq('fulfillment_id', fixture.fulfillmentId),
      client.from('supply_settlement_items').select('status, amount_silver, crafter_member_id').eq('guild_id', tenant.guildId).eq('fulfillment_id', fixture.fulfillmentId).single(),
      client.from('admin_audit_log').select('id').eq('guild_id', tenant.guildId).eq('target_id', fixture.taskId).eq('action', 'craft.task.deliver'),
      client.from('domain_outbox').select('topic').eq('guild_id', tenant.guildId).eq('aggregate_id', fixture.fulfillmentId).eq('topic', 'craft.ready_for_pickup'),
      client.from('application_command_runs').select('id').eq('guild_id', tenant.guildId).eq('idempotency_key', commandId),
    ])
    expect(inventory.error).toBeNull()
    expect(inventory.data?.quantity).toBe(0)
    expect(movements.data).toEqual([{ delta: -1, reason: 'craft_delivery' }])
    expect(outside.data).toEqual([{ item_id: headId, quantity: 1 }])
    expect(settlement.data).toMatchObject({
      status: 'payable',
      amount_silver: 132_000,
      crafter_member_id: fixture.crafterId,
    })
    expect(audit.data).toHaveLength(1)
    expect(outbox.data).toHaveLength(1)
    expect(run.data).toHaveLength(1)

    const paymentId = crypto.randomUUID()
    const paymentArgs = {
      p_guild_id: tenant.guildId,
      p_crafter_member_id: fixture.crafterId,
      p_actor_discord_id: adminDiscordId,
      p_actor_username: 'Supply Admin',
      p_idempotency_key: paymentId,
      p_correlation_id: paymentId,
      p_note: 'integration payment',
    }
    const paid = await client.rpc('pay_supply_settlement_batch', paymentArgs)
    const paidReplay = await client.rpc('pay_supply_settlement_batch', paymentArgs)
    expect(paid.error).toBeNull()
    expect(paid.data).toMatchObject({ totalSilver: 132_000, itemCount: 1, replayed: false })
    expect(paidReplay.data).toMatchObject({ replayed: true })
    const paymentConflict = await client.rpc('pay_supply_settlement_batch', {
      ...paymentArgs,
      p_note: 'different payment note',
    })
    expect(paymentConflict.error?.message).toContain('SUPPLY_SETTLEMENT_IDEMPOTENCY_CONFLICT')

    const pickupId = crypto.randomUUID()
    const pickupArgs = {
      p_task_id: fixture.taskId,
      p_guild_id: tenant.guildId,
      p_member_discord_id: requesterDiscordId,
      p_idempotency_key: pickupId,
      p_correlation_id: pickupId,
    }
    const pickedUp = await client.rpc('collect_supply_fulfillment', pickupArgs)
    const pickupReplay = await client.rpc('collect_supply_fulfillment', pickupArgs)
    expect(pickedUp.error).toBeNull()
    expect(pickedUp.data).toMatchObject({ status: 'completed', replayed: false })
    expect(pickupReplay.data).toMatchObject({ status: 'completed', replayed: true })

    const { data: finalState, error: finalStateError } = await client
      .from('supply_fulfillments')
      .select('status')
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.fulfillmentId)
      .single()
    const { data: finalSettlement } = await client
      .from('supply_settlement_items')
      .select('status, payment_batch_id')
      .eq('guild_id', tenant.guildId)
      .eq('fulfillment_id', fixture.fulfillmentId)
      .single()
    expect(finalStateError).toBeNull()
    expect(finalState?.status).toBe('completed')
    expect(finalSettlement?.status).toBe('paid')
    expect(finalSettlement?.payment_batch_id).not.toBeNull()
  })

  it('lets a linked Discord alias finish the same stable crafter delivery', async () => {
    const client = getTestServiceClient()
    const fixture = await createSupplyTask('linked-alias')
    expect((await claim(fixture, 'guild_stock', 'none', 0)).error).toBeNull()

    const linkedAlias = `alias-${crypto.randomUUID()}`
    const attached = await client.rpc('attach_guild_member_access_identity', {
      p_guild_id: tenant.guildId,
      p_guild_member_id: fixture.crafterId,
      p_identity_type: 'discord',
      p_subject_id: linkedAlias,
      p_source: 'integration_supply_alias',
    })
    expect(attached.error).toBeNull()

    const commandId = crypto.randomUUID()
    const delivered = await client.rpc('execute_supply_craft_delivery', {
      p_guild_id: tenant.guildId,
      p_idempotency_key: commandId,
      p_correlation_id: commandId,
      p_actor_discord_id: linkedAlias,
      p_actor_username: 'Linked Supply Crafter',
      p_source: 'web',
      p_request_payload: { taskId: fixture.taskId, boxNumber: 2 },
      p_execution_payload: { followupDays: 7 },
      p_confirmation_token: null,
    })
    expect(delivered.error).toBeNull()
    expect(delivered.data).toMatchObject({
      status: 'ready_for_pickup',
      replayed: false,
    })

    const [task, run] = await Promise.all([
      client
        .from('craft_tasks')
        .select('status, crafter_discord_id, crafter_guild_member_id')
        .eq('guild_id', tenant.guildId)
        .eq('id', fixture.taskId)
        .single(),
      client
        .from('application_command_runs')
        .select('actor_discord_id')
        .eq('guild_id', tenant.guildId)
        .eq('idempotency_key', commandId)
        .single(),
    ])
    expect(task.error).toBeNull()
    expect(task.data).toEqual({
      status: 'delivered',
      crafter_discord_id: crafterDiscordId,
      crafter_guild_member_id: fixture.crafterId,
    })
    expect(run.data?.actor_discord_id).toBe(linkedAlias)
  })

  it('marks overdue without releasing custody, preserves it through box moves, and returns stock once', async () => {
    const client = getTestServiceClient()
    const fixture = await createSupplyTask('custody')
    expect((await claim(fixture, 'guild_stock', 'none', 0)).error).toBeNull()
    expect((await deliver(fixture, 3, crypto.randomUUID())).error).toBeNull()

    const past = new Date(Date.now() - 60_000).toISOString()
    const dueUpdate = await client
      .from('supply_fulfillments')
      .update({ receipt_due_at: past })
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.fulfillmentId)
    expect(dueUpdate.error).toBeNull()

    const overdue = await client.rpc('expire_craft_tasks')
    expect(overdue.error).toBeNull()
    expect(overdue.data).toBe(1)
    const beforeMove = await client
      .from('craft_tasks')
      .select('status, box_number, expired_at')
      .eq('guild_id', tenant.guildId)
      .eq('id', fixture.taskId)
      .single()
    expect(beforeMove.data).toEqual({ status: 'delivered', box_number: 3, expired_at: null })

    const moveId = crypto.randomUUID()
    const moved = await client.rpc('move_supply_craft_box', {
      p_task_id: fixture.taskId,
      p_guild_id: tenant.guildId,
      p_box_number: 4,
      p_actor_discord_id: adminDiscordId,
      p_idempotency_key: moveId,
      p_correlation_id: moveId,
    })
    expect(moved.error).toBeNull()
    expect(moved.data).toMatchObject({ status: 'receipt_overdue', boxNumber: 4 })

    const returnId = crypto.randomUUID()
    const returnArgs = {
      p_task_id: fixture.taskId,
      p_guild_id: tenant.guildId,
      p_actor_discord_id: adminDiscordId,
      p_idempotency_key: returnId,
      p_correlation_id: returnId,
      p_reason: 'not collected',
    }
    const returned = await client.rpc('return_unclaimed_supply_craft', returnArgs)
    const replay = await client.rpc('return_unclaimed_supply_craft', returnArgs)
    expect(returned.error).toBeNull()
    expect(returned.data).toMatchObject({ status: 'returned_unclaimed', replayed: false })
    expect(replay.error).toBeNull()
    expect(replay.data).toMatchObject({ status: 'returned_unclaimed', replayed: true })

    const { data: stock } = await client
      .from('guild_inventory_gear')
      .select('item_id, quantity')
      .eq('guild_id', tenant.guildId)
      .in('item_id', ['T8_2H_BOW_custody', 'T8_HEAD_CLOTH_custody'])
      .order('item_id')
    expect(stock).toEqual([
      { item_id: 'T8_2H_BOW_custody', quantity: 1 },
      { item_id: 'T8_HEAD_CLOTH_custody', quantity: 1 },
    ])
    const { data: returnMovements } = await client
      .from('guild_inventory_movements')
      .select('reason')
      .eq('guild_id', tenant.guildId)
      .eq('reference_id', fixture.fulfillmentId)
      .eq('reason', 'unclaimed_return')
    expect(returnMovements).toHaveLength(2)
  })

  it('enforces tenant-composite ownership and hides internal trigger functions from direct service calls', async () => {
    const client = getTestServiceClient()
    const fixture = await createSupplyTask('tenant')
    const other = await createTestTenant(`supply-other-${crypto.randomUUID().slice(0, 8)}`)
    extraTenants.push(other)

    const crossTenant = await client.from('supply_fulfillment_events').insert({
      guild_id: other.guildId,
      fulfillment_id: fixture.fulfillmentId,
      event_type: 'cross_tenant_attempt',
      correlation_id: crypto.randomUUID(),
      idempotency_key: crypto.randomUUID(),
      details: {},
    })
    expect(crossTenant.error?.code).toBe('23503')

    const directSync = await client.rpc('sync_supply_fulfillment_from_craft_task')
    const directInventory = await client.rpc('record_finished_inventory_projection_movement')
    expect(directSync.error).not.toBeNull()
    expect(directInventory.error).not.toBeNull()
  })
})
