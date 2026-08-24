import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
  enableTestTenantFeatures,
  getTestServiceClient,
  hasTestEnv,
  type TestTenant,
} from '@/test/integration-helpers'

// 도메인 invariant 화석화 (Phase 2): 멀티테넌트 unique 경계.
//
// 마이그 130 (`130_multi_tenant_unique_backfill.sql`) 가 다섯 군데 자연키
// unique 를 `(guild_id, ...)` 복합으로 재구성했다. 회귀 위험이 크다 —
// 다른 테넌트가 같은 자연키로 들어왔을 때 silent 데이터 손실 / cross-tenant
// 누락이 발생할 수 있다 (feedback_albion_zvz_unique_scope.md 참고).
//
// 이 테스트는 그 invariant 를 DB 레벨에서 직접 검증한다. 단위 테스트로는
// 검증 불가능 — 실제 unique constraint 가 적용된 Postgres 가 필요하다.
//
// 활성화 조건: TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_KEY env. 없으면
// describe.skip 으로 안전 통과.

const describeIntegration = hasTestEnv() ? describe : describe.skip

describeIntegration('shop_inventory tenant scope (mig 130/200)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('shop-a')
    tenantB = await createTestTenant('shop-b')
    await Promise.all([
      enableTestTenantFeatures(tenantA.guildId, ['guild_shop']),
      enableTestTenantFeatures(tenantB.guildId, ['guild_shop']),
    ])
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('allows the same (unique_name, enchant) across different tenants', async () => {
    const client = getTestServiceClient()
    const row = {
      unique_name: 'T8_MAIN_FIRESTAFF',
      enchant: 3,
      quality: 4,
      stock: 5,
      name_ko: '화염 스태프 테스트',
    }

    const { error: errA } = await client
      .from('shop_inventory')
      .insert({ guild_id: tenantA.guildId, ...row })
    expect(errA).toBeNull()

    const { error: errB } = await client
      .from('shop_inventory')
      .insert({ guild_id: tenantB.guildId, ...row })
    expect(errB).toBeNull()
  })

  it('rejects duplicate (unique_name, enchant) within the same tenant even when quality differs', async () => {
    const client = getTestServiceClient()
    const row = {
      unique_name: 'T8_MAIN_HOLYSTAFF',
      enchant: 2,
      quality: 3,
      stock: 1,
      name_ko: '신성 스태프 테스트',
    }

    const { error: errFirst } = await client
      .from('shop_inventory')
      .insert({ guild_id: tenantA.guildId, ...row })
    expect(errFirst).toBeNull()

    const { error: errDup } = await client
      .from('shop_inventory')
      .insert({ guild_id: tenantA.guildId, ...row, quality: 5 })
    // Postgres unique_violation
    expect(errDup?.code).toBe('23505')
  })

  it('ON CONFLICT (guild_id, unique_name, enchant) upserts within tenant scope', async () => {
    // ON CONFLICT 컬럼셋 ↔ unique 인덱스 컬럼셋 일치 검증. shop_inventory_guild_unique
    // 에 정확히 매칭되는 onConflict 문자열이 아니면 PostgREST 가 42P10 으로 거절한다.
    const client = getTestServiceClient()
    const baseRow = {
      unique_name: 'T6_MAIN_BOW',
      enchant: 1,
      quality: 2,
      name_ko: '활 테스트',
    }

    const { error: errInsert } = await client
      .from('shop_inventory')
      .insert({ guild_id: tenantA.guildId, ...baseRow, stock: 3 })
    expect(errInsert).toBeNull()

    const { data: upserted, error: errUpsert } = await client
      .from('shop_inventory')
      .upsert(
        { guild_id: tenantA.guildId, ...baseRow, stock: 99 },
        { onConflict: 'guild_id,unique_name,enchant' },
      )
      .select()
      .single()

    expect(errUpsert).toBeNull()
    expect(upserted?.stock).toBe(99)

    // Tenant B 가 같은 자연키로 upsert 해도 tenant A 의 행을 건드리지 않는다.
    const { error: errUpsertB } = await client
      .from('shop_inventory')
      .upsert(
        { guild_id: tenantB.guildId, ...baseRow, stock: 7 },
        { onConflict: 'guild_id,unique_name,enchant' },
      )
    expect(errUpsertB).toBeNull()

    const { data: aRows } = await client
      .from('shop_inventory')
      .select('stock')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', baseRow.unique_name)
      .eq('enchant', baseRow.enchant)
      .eq('quality', 1)
    expect(aRows?.[0]?.stock).toBe(99) // tenant A 의 값은 보존
  })

  it('does not create negative inventory when a withdrawal log is the first delta', async () => {
    const client = getTestServiceClient()

    const { data: stock, error } = await client.rpc('apply_shop_stock_delta', {
      p_guild_id: tenantA.guildId,
      p_unique_name: 'T8_MAIN_CURSEDSTAFF',
      p_enchant: 1,
      p_quality: 2,
      p_delta: -3,
      p_name_ko: '저주받은 지팡이 테스트',
      p_category: 'magic',
      p_tier: 8,
    })

    expect(error).toBeNull()
    expect(stock).toBe(0)

    const { data: rows } = await client
      .from('shop_inventory')
      .select('id')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', 'T8_MAIN_CURSEDSTAFF')

    expect(rows).toEqual([])
  })

  it('applies ordered batch stock deltas within tenant scope', async () => {
    const client = getTestServiceClient()
    const uniqueName = 'T7_MAIN_SPEAR'
    await expect(
      client.from('shop_inventory').insert({
        guild_id: tenantB.guildId,
        unique_name: uniqueName,
        enchant: 0,
        quality: 1,
        stock: 99,
        name_ko: '창 테스트',
      }),
    ).resolves.toMatchObject({ error: null })

    const { data: applied, error } = await client.rpc('apply_shop_stock_deltas', {
      p_guild_id: tenantA.guildId,
      p_deltas: [
        {
          unique_name: uniqueName,
          enchant: 0,
          quality: 1,
          delta: -2,
          name_ko: '창 테스트',
          category: 'melee',
          tier: 7,
        },
        {
          unique_name: uniqueName,
          enchant: 0,
          quality: 1,
          delta: 5,
          name_ko: '창 테스트',
          category: 'melee',
          tier: 7,
        },
        {
          unique_name: uniqueName,
          enchant: 0,
          quality: 1,
          delta: -3,
          name_ko: '창 테스트',
          category: 'melee',
          tier: 7,
        },
      ],
    })

    expect(error).toBeNull()
    expect(applied).toBe(3)

    const { data: tenantARow } = await client
      .from('shop_inventory')
      .select('stock, category, tier')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', uniqueName)
      .single()
    expect(tenantARow?.stock).toBe(2)
    expect(tenantARow?.category).toBe('melee')
    expect(tenantARow?.tier).toBe(7)

    const { data: tenantBRow } = await client
      .from('shop_inventory')
      .select('stock')
      .eq('guild_id', tenantB.guildId)
      .eq('unique_name', uniqueName)
      .single()
    expect(tenantBRow?.stock).toBe(99)
  })

  it('approves a shop order with an adjusted total against tenant-scoped balance and stock', async () => {
    const client = getTestServiceClient()
    const orderId = crypto.randomUUID()
    const discordId = `shop-buyer-${crypto.randomUUID()}`
    const itemKey = {
      unique_name: 'T8_MAIN_FIRESTAFF',
      enchant: 0,
      quality: 1,
    }

    const { error: balanceErr } = await client.from('point_ledger').insert({
      guild_id: tenantA.guildId,
      discord_id: discordId,
      delta: 700,
      reason: 'admin_adjust',
      memo: 'test seed',
    })
    expect(balanceErr).toBeNull()

    const { error: stockErr } = await client.from('shop_inventory').insert({
      guild_id: tenantA.guildId,
      ...itemKey,
      stock: 2,
      name_ko: '화염 지팡이 테스트',
      category: 'magic',
      tier: 8,
    })
    expect(stockErr).toBeNull()

    const { error: orderErr } = await client.from('shop_orders').insert({
      id: orderId,
      guild_id: tenantA.guildId,
      discord_id: discordId,
      username: 'Shop Buyer',
      total_points: 1000,
      status: 'pending',
    })
    expect(orderErr).toBeNull()

    const { error: itemErr } = await client.from('shop_order_items').insert({
      guild_id: tenantA.guildId,
      order_id: orderId,
      ...itemKey,
      name_ko: '화염 지팡이 테스트',
      quantity: 1,
      unit_points: 1000,
      subtotal_points: 1000,
    })
    expect(itemErr).toBeNull()

    const { error: approveErr } = await client.rpc('approve_shop_order', {
      p_id: orderId,
      p_admin_id: 'admin-discord',
      p_guild_id: tenantA.guildId,
      p_admin_note: 'adjusted total',
      p_total_points_override: 700,
    })
    expect(approveErr).toBeNull()

    const { data: order } = await client
      .from('shop_orders')
      .select('status, total_points, admin_note')
      .eq('guild_id', tenantA.guildId)
      .eq('id', orderId)
      .single()
    expect(order).toMatchObject({
      status: 'approved',
      total_points: 700,
      admin_note: 'adjusted total',
    })

    const { data: stock } = await client
      .from('shop_inventory')
      .select('stock')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', itemKey.unique_name)
      .eq('enchant', itemKey.enchant)
      .eq('quality', 1)
      .single()
    expect(stock?.stock).toBe(1)

    const { data: debit } = await client
      .from('point_ledger')
      .select('delta, reason')
      .eq('guild_id', tenantA.guildId)
      .eq('discord_id', discordId)
      .eq('ref_id', orderId)
      .single()
    expect(debit).toMatchObject({ delta: -700, reason: 'shop_purchase' })
  })

  it('resets shop inventory for one tenant and cancels only pending shop orders', async () => {
    const client = getTestServiceClient()
    const tenantAOrderPending = crypto.randomUUID()
    const tenantAOrderApproved = crypto.randomUUID()
    const tenantBOrderPending = crypto.randomUUID()
    const itemKey = {
      unique_name: 'T7_MAIN_CURSEDSTAFF',
      enchant: 1,
      quality: 2,
    }

    const { error: invErr } = await client.from('shop_inventory').insert([
      {
        guild_id: tenantA.guildId,
        ...itemKey,
        stock: 3,
        name_ko: '저주 지팡이 테스트',
        category: 'magic',
        tier: 7,
      },
      {
        guild_id: tenantB.guildId,
        ...itemKey,
        stock: 5,
        name_ko: '저주 지팡이 테스트',
        category: 'magic',
        tier: 7,
      },
    ])
    expect(invErr).toBeNull()

    const { error: logErr } = await client.from('shop_chest_logs').insert([
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-01T00:00:00.000Z',
        player: 'TenantA',
        item_name_raw: '저주 지팡이 테스트',
        enchant: 1,
        quality: 2,
        quantity: 3,
        unique_name: itemKey.unique_name,
      },
      {
        guild_id: tenantB.guildId,
        logged_at: '2026-05-01T00:00:00.000Z',
        player: 'TenantB',
        item_name_raw: '저주 지팡이 테스트',
        enchant: 1,
        quality: 2,
        quantity: 5,
        unique_name: itemKey.unique_name,
      },
    ])
    expect(logErr).toBeNull()

    const { error: baselineErr } = await client.from('shop_baselines').insert([
      {
        guild_id: tenantA.guildId,
        baseline_at: '2026-05-01T00:00:00.000Z',
        baseline_start: '2026-05-01T00:00:00.000Z',
        snapshot: [
          {
            uniqueName: itemKey.unique_name,
            nameKo: '저주 지팡이 테스트',
            category: 'magic',
            tier: 7,
            enchant: itemKey.enchant,
            quality: itemKey.quality,
            quantity: 3,
          },
        ],
        total_items: 3,
        total_events: 1,
        depositor: 'TenantA',
        status: 'confirmed',
        confirmed_by: 'admin-discord',
      },
      {
        guild_id: tenantB.guildId,
        baseline_at: '2026-05-01T00:00:00.000Z',
        baseline_start: '2026-05-01T00:00:00.000Z',
        snapshot: [
          {
            uniqueName: itemKey.unique_name,
            nameKo: '저주 지팡이 테스트',
            category: 'magic',
            tier: 7,
            enchant: itemKey.enchant,
            quality: itemKey.quality,
            quantity: 5,
          },
        ],
        total_items: 5,
        total_events: 1,
        depositor: 'TenantB',
        status: 'confirmed',
        confirmed_by: 'admin-discord',
      },
    ])
    expect(baselineErr).toBeNull()

    const { error: orderErr } = await client.from('shop_orders').insert([
      {
        id: tenantAOrderPending,
        guild_id: tenantA.guildId,
        discord_id: 'tenant-a-pending',
        username: 'Tenant A Pending',
        total_points: 100,
        status: 'pending',
      },
      {
        id: tenantAOrderApproved,
        guild_id: tenantA.guildId,
        discord_id: 'tenant-a-approved',
        username: 'Tenant A Approved',
        total_points: 100,
        status: 'approved',
      },
      {
        id: tenantBOrderPending,
        guild_id: tenantB.guildId,
        discord_id: 'tenant-b-pending',
        username: 'Tenant B Pending',
        total_points: 100,
        status: 'pending',
      },
    ])
    expect(orderErr).toBeNull()

    const { data, error } = await client.rpc('reset_shop_inventory_all', {
      p_guild_id: tenantA.guildId,
      p_admin_id: 'admin-discord',
      p_cancel_note: 'reset note',
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({
      inventory_rows_deleted: 1,
      logs_deleted: 1,
      orders_cancelled: 1,
      baselines_superseded: 1,
    })

    const { count: tenantAInventoryCount } = await client
      .from('shop_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenantA.guildId)
    expect(tenantAInventoryCount).toBe(0)

    const { count: tenantALogCount } = await client
      .from('shop_chest_logs')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', tenantA.guildId)
    expect(tenantALogCount).toBe(0)

    const { data: tenantABaseline } = await client
      .from('shop_baselines')
      .select('status')
      .eq('guild_id', tenantA.guildId)
      .single()
    expect(tenantABaseline?.status).toBe('superseded')

    const { data: tenantAOrders } = await client
      .from('shop_orders')
      .select('id, status, admin_note, resolved_by')
      .eq('guild_id', tenantA.guildId)
      .in('id', [tenantAOrderPending, tenantAOrderApproved])
    expect(tenantAOrders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: tenantAOrderPending,
          status: 'cancelled',
          admin_note: 'reset note',
          resolved_by: 'admin-discord',
        }),
        expect.objectContaining({
          id: tenantAOrderApproved,
          status: 'approved',
        }),
      ]),
    )

    const { data: tenantBInventory } = await client
      .from('shop_inventory')
      .select('stock')
      .eq('guild_id', tenantB.guildId)
      .eq('unique_name', itemKey.unique_name)
      .single()
    expect(tenantBInventory?.stock).toBe(5)

    const { data: tenantBOrder } = await client
      .from('shop_orders')
      .select('status')
      .eq('guild_id', tenantB.guildId)
      .eq('id', tenantBOrderPending)
      .single()
    expect(tenantBOrder?.status).toBe('pending')

    const { data: tenantBBaseline } = await client
      .from('shop_baselines')
      .select('status')
      .eq('guild_id', tenantB.guildId)
      .single()
    expect(tenantBBaseline?.status).toBe('confirmed')
  })

  it('maintains member point balance projections within tenant scope', async () => {
    const client = getTestServiceClient()
    const discordId = `projection-${crypto.randomUUID()}`

    const { error: insertErr } = await client.from('point_ledger').insert([
      {
        guild_id: tenantA.guildId,
        discord_id: discordId,
        delta: 500,
        reason: 'admin_adjust',
        memo: 'projection credit',
      },
      {
        guild_id: tenantA.guildId,
        discord_id: discordId,
        delta: -120,
        reason: 'admin_adjust',
        memo: 'projection debit',
      },
      {
        guild_id: tenantB.guildId,
        discord_id: discordId,
        delta: 999,
        reason: 'admin_adjust',
        memo: 'other tenant credit',
      },
    ])
    expect(insertErr).toBeNull()

    const { data: tenantABalance, error: balanceErrA } = await client
      .from('member_point_balances')
      .select('balance, lifetime_earned, lifetime_spent, entries_count')
      .eq('guild_id', tenantA.guildId)
      .eq('discord_id', discordId)
      .single()
    expect(balanceErrA).toBeNull()
    expect(tenantABalance).toMatchObject({
      balance: 380,
      lifetime_earned: 500,
      lifetime_spent: 120,
      entries_count: 2,
    })

    const { data: tenantBBalance, error: balanceErrB } = await client
      .from('member_point_balances')
      .select('balance, lifetime_earned, lifetime_spent, entries_count')
      .eq('guild_id', tenantB.guildId)
      .eq('discord_id', discordId)
      .single()
    expect(balanceErrB).toBeNull()
    expect(tenantBBalance).toMatchObject({
      balance: 999,
      lifetime_earned: 999,
      lifetime_spent: 0,
      entries_count: 1,
    })
  })

  it('deletes a tenant with point-ledger rows without recreating a child projection', async () => {
    const client = getTestServiceClient()
    const disposable = await createTestTenant('point-cascade-cleanup')

    try {
      const { error: insertError } = await client.from('point_ledger').insert({
        guild_id: disposable.guildId,
        discord_id: `cascade-${crypto.randomUUID()}`,
        delta: 10,
        reason: 'admin_adjust',
        memo: 'tenant cascade regression',
      })
      expect(insertError).toBeNull()

      const { error: deleteError } = await client
        .from('tenants')
        .delete()
        .eq('id', disposable.guildId)
      expect(deleteError).toBeNull()

      const [{ count: ledgerCount }, { count: balanceCount }] = await Promise.all([
        client
          .from('point_ledger')
          .select('id', { count: 'exact', head: true })
          .eq('guild_id', disposable.guildId),
        client
          .from('member_point_balances')
          .select('discord_id', { count: 'exact', head: true })
          .eq('guild_id', disposable.guildId),
      ])
      expect(ledgerCount).toBe(0)
      expect(balanceCount).toBe(0)
    } finally {
      await disposable.cleanup()
    }
  })

  it('uses cron run table leases to skip overlapping jobs', async () => {
    const client = getTestServiceClient()
    const jobName = `test-cron-${crypto.randomUUID()}`

    const { data: first, error: firstErr } = await client.rpc('try_start_cron_run', {
      p_job_name: jobName,
      p_lease_seconds: 300,
    })
    expect(firstErr).toBeNull()
    expect(first?.[0]?.started).toBe(true)
    const runId = first?.[0]?.run_id as string

    const { data: second, error: secondErr } = await client.rpc('try_start_cron_run', {
      p_job_name: jobName,
      p_lease_seconds: 300,
    })
    expect(secondErr).toBeNull()
    expect(second?.[0]).toMatchObject({ started: false, reason: 'lock-held' })

    const { error: finishErr } = await client.rpc('finish_cron_run', {
      p_run_id: runId,
      p_status: 'succeeded',
      p_response: { ok: true },
      p_error: null,
    })
    expect(finishErr).toBeNull()

    const { data: third, error: thirdErr } = await client.rpc('try_start_cron_run', {
      p_job_name: jobName,
      p_lease_seconds: 300,
    })
    expect(thirdErr).toBeNull()
    expect(third?.[0]?.started).toBe(true)

    await client.rpc('finish_cron_run', {
      p_run_id: third?.[0]?.run_id,
      p_status: 'succeeded',
      p_response: { ok: true },
      p_error: null,
    })
    await client.from('cron_locks').delete().eq('job_name', jobName)
    await client.from('cron_runs').delete().eq('job_name', jobName)
  })

  it('marks an interrupted cron run failed after its lease expires', async () => {
    const client = getTestServiceClient()
    const jobName = `test-stale-cron-${crypto.randomUUID()}`
    const { data: started, error: startError } = await client.rpc('try_start_cron_run', {
      p_job_name: jobName,
      p_lease_seconds: 60,
      p_lock_name: jobName,
    })
    expect(startError).toBeNull()
    expect(started?.[0]?.started).toBe(true)

    const future = new Date(Date.now() + 61_000).toISOString()
    const { data: expired, error: expireError } = await client.rpc(
      'expire_stale_cron_runs',
      { p_now: future, p_limit: 10 },
    )
    expect(expireError).toBeNull()
    expect(expired).toBe(1)

    const { data: run, error: runError } = await client
      .from('cron_runs')
      .select('status, error, completed_at')
      .eq('id', started![0].run_id)
      .single()
    expect(runError).toBeNull()
    expect(run).toMatchObject({ status: 'failed', error: 'lease-expired' })
    expect(run?.completed_at).toBeTruthy()

    await client.from('cron_locks').delete().eq('job_name', jobName)
    await client.from('cron_runs').delete().eq('job_name', jobName)
  })

  it('serializes distinct cron jobs through a shared lock name', async () => {
    const client = getTestServiceClient()
    const lockName = `test-shared-cron-${crypto.randomUUID()}`
    const firstJob = `${lockName}-first`
    const secondJob = `${lockName}-second`

    const { data: first, error: firstErr } = await client.rpc('try_start_cron_run', {
      p_job_name: firstJob,
      p_lease_seconds: 300,
      p_lock_name: lockName,
    })
    expect(firstErr).toBeNull()
    expect(first?.[0]?.started).toBe(true)

    const { data: second, error: secondErr } = await client.rpc('try_start_cron_run', {
      p_job_name: secondJob,
      p_lease_seconds: 300,
      p_lock_name: lockName,
    })
    expect(secondErr).toBeNull()
    expect(second?.[0]).toMatchObject({ started: false, reason: 'lock-held' })

    await client.rpc('finish_cron_run', {
      p_run_id: first?.[0]?.run_id,
      p_status: 'succeeded',
      p_response: { ok: true },
      p_error: null,
    })
    await client.from('cron_locks').delete().eq('job_name', lockName)
    await client.from('cron_runs').delete().in('job_name', [firstJob, secondJob])
  })

  it('preserves pricing metadata and replays post-baseline logs in order when applying a shop baseline', async () => {
    const client = getTestServiceClient()
    const key = {
      unique_name: 'T7_2H_FIRESTAFF',
      enchant: 2,
      quality: 3,
    }
    const zeroKey = {
      unique_name: 'T7_MAIN_ARCANESTAFF',
      enchant: 1,
      quality: 2,
    }

    const { error: insertErr } = await client.from('shop_inventory').insert([
      {
        guild_id: tenantA.guildId,
        ...key,
        stock: 9,
        name_ko: '화염 지팡이 테스트',
        category: 'magic',
        tier: 7,
        manual_price: 12345,
        auto_price_silver: 45678,
        price_source: 'manual',
        price_warning_level: 'quality',
        price_updated_at: '2026-05-01T00:00:00Z',
      },
      {
        guild_id: tenantA.guildId,
        ...zeroKey,
        stock: 6,
        name_ko: '신비 지팡이 가격 보존 테스트',
        category: 'magic',
        tier: 7,
        manual_price: 22222,
        price_source: 'manual',
      },
    ])
    expect(insertErr).toBeNull()

    const { error: logsErr } = await client.from('shop_chest_logs').insert([
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-02T00:10:00Z',
        import_sequence: 0,
        player: 'after-withdraw-first',
        item_name_raw: '화염 지팡이 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: -10,
        unique_name: key.unique_name,
      },
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-02T00:10:00Z',
        import_sequence: 1,
        player: 'after-deposit',
        item_name_raw: '화염 지팡이 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: 5,
        unique_name: key.unique_name,
      },
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-02T00:10:00Z',
        import_sequence: 2,
        player: 'after-withdraw',
        item_name_raw: '화염 지팡이 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: -2,
        unique_name: key.unique_name,
      },
    ])
    expect(logsErr).toBeNull()

    const { error } = await client.rpc('apply_shop_baseline', {
      p_guild_id: tenantA.guildId,
      p_baseline_at: '2026-05-02T00:00:00Z',
      p_baseline_start: '2026-05-02T00:00:00Z',
      p_snapshot: [
        {
          uniqueName: key.unique_name,
          nameKo: '화염 지팡이 테스트',
          category: 'magic',
          tier: 7,
          enchant: key.enchant,
          quality: key.quality,
          quantity: 4,
        },
      ],
      p_total_items: 4,
      p_total_events: 1,
      p_depositor: 'Tester',
      p_admin_id: 'admin',
      p_notes: null,
    })

    expect(error).toBeNull()

    const { data: row } = await client
      .from('shop_inventory')
      .select('stock, manual_price, auto_price_silver, price_source, price_warning_level, price_updated_at')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', key.unique_name)
      .eq('enchant', key.enchant)
      .eq('quality', 1)
      .single()

    expect(row?.stock).toBe(3)
    expect(row?.manual_price).toBe(12345)
    expect(row?.auto_price_silver).toBe(45678)
    expect(row?.price_source).toBe('manual')
    expect(row?.price_warning_level).toBe('quality')
    expect(new Date(row?.price_updated_at as string).toISOString()).toBe(
      '2026-05-01T00:00:00.000Z',
    )

    const { data: zeroRow } = await client
      .from('shop_inventory')
      .select('stock, manual_price, price_source')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', zeroKey.unique_name)
      .eq('enchant', zeroKey.enchant)
      .eq('quality', 1)
      .single()

    expect(zeroRow?.stock).toBe(0)
    expect(zeroRow?.manual_price).toBe(22222)
    expect(zeroRow?.price_source).toBe('manual')
  })

  it('seeds the latest confirmed shop baseline before rebuilding from chest logs', async () => {
    const client = getTestServiceClient()
    const key = {
      unique_name: 'T7_MAIN_FROSTSTAFF',
      enchant: 1,
      quality: 2,
    }

    const { error: baselineErr } = await client.rpc('apply_shop_baseline', {
      p_guild_id: tenantA.guildId,
      p_baseline_at: '2026-05-02T00:00:00Z',
      p_baseline_start: '2026-05-02T00:00:00Z',
      p_snapshot: [
        {
          uniqueName: key.unique_name,
          nameKo: '서리 지팡이 테스트',
          category: 'magic',
          tier: 7,
          enchant: key.enchant,
          quality: key.quality,
          quantity: 4,
        },
      ],
      p_total_items: 4,
      p_total_events: 1,
      p_depositor: 'Tester',
      p_admin_id: 'admin',
      p_notes: null,
    })
    expect(baselineErr).toBeNull()

    const { error: logErr } = await client.from('shop_chest_logs').insert([
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-01T00:00:00Z',
        player: 'before-baseline',
        item_name_raw: '서리 지팡이 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: 100,
        unique_name: key.unique_name,
      },
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-02T00:10:00Z',
        player: 'after-baseline-deposit',
        item_name_raw: '서리 지팡이 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: 6,
        unique_name: key.unique_name,
      },
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-02T00:20:00Z',
        player: 'after-baseline-withdraw',
        item_name_raw: '서리 지팡이 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: -3,
        unique_name: key.unique_name,
      },
    ])
    expect(logErr).toBeNull()

    const { error: corruptErr } = await client
      .from('shop_inventory')
      .update({ stock: 99, manual_price: 44444, price_source: 'manual' })
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', key.unique_name)
      .eq('enchant', key.enchant)
      .eq('quality', 1)
    expect(corruptErr).toBeNull()

    const { data: drift, error } = await client.rpc('rebuild_shop_inventory_from_chest_logs', {
      p_guild_id: tenantA.guildId,
      p_start_at: '2026-05-01T00:00:00Z',
    })

    expect(error).toBeNull()
    expect((drift as Record<string, unknown>).before_total).toBe(99)
    expect((drift as Record<string, unknown>).after_total).toBe(7)

    const { data: row } = await client
      .from('shop_inventory')
      .select('stock, manual_price, price_source')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', key.unique_name)
      .eq('enchant', key.enchant)
      .eq('quality', 1)
      .single()

    expect(row?.stock).toBe(7)
    expect(row?.manual_price).toBe(44444)
    expect(row?.price_source).toBe('manual')

    const { error: recorruptErr } = await client
      .from('shop_inventory')
      .update({ stock: 99 })
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', key.unique_name)
      .eq('enchant', key.enchant)
      .eq('quality', 1)
    expect(recorruptErr).toBeNull()

    const { data: startAfterBaselineDrift, error: startAfterBaselineErr } = await client.rpc(
      'rebuild_shop_inventory_from_chest_logs',
      {
        p_guild_id: tenantA.guildId,
        p_start_at: '2026-05-02T00:15:00Z',
      },
    )

    expect(startAfterBaselineErr).toBeNull()
    expect((startAfterBaselineDrift as Record<string, unknown>).before_total).toBe(99)
    expect((startAfterBaselineDrift as Record<string, unknown>).after_total).toBe(0)

    const { data: rowAfterMovedStart } = await client
      .from('shop_inventory')
      .select('stock, manual_price, price_source')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', key.unique_name)
      .eq('enchant', key.enchant)
      .eq('quality', 1)
      .single()

    expect(rowAfterMovedStart?.stock).toBe(0)
    expect(rowAfterMovedStart?.manual_price).toBe(44444)
    expect(rowAfterMovedStart?.price_source).toBe('manual')
  })

  it('rebuilds shop inventory from chest logs after the operating start within tenant scope', async () => {
    const client = getTestServiceClient()
    const key = {
      unique_name: 'T6_MAIN_SPEAR',
      enchant: 1,
      quality: 2,
    }
    const zeroKey = {
      unique_name: 'T6_MAIN_RAPIER',
      enchant: 0,
      quality: 1,
    }

    const { error: invErr } = await client.from('shop_inventory').insert([
      {
        guild_id: tenantA.guildId,
        ...key,
        stock: 99,
        name_ko: '창 테스트',
        category: 'melee',
        tier: 6,
        manual_price: 777,
      },
      {
        guild_id: tenantB.guildId,
        ...key,
        stock: 42,
        name_ko: '창 테스트 B',
        category: 'melee',
        tier: 6,
      },
      {
        guild_id: tenantA.guildId,
        ...zeroKey,
        stock: 12,
        name_ko: '레이피어 가격 보존 테스트',
        category: 'melee',
        tier: 6,
        manual_price: 999,
        price_source: 'manual',
      },
    ])
    expect(invErr).toBeNull()

    const { error: logErr } = await client.from('shop_chest_logs').insert([
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-01T00:00:00Z',
        player: 'A-before',
        item_name_raw: '창 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: 30,
        unique_name: key.unique_name,
      },
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-02T00:00:00Z',
        player: 'A-after-early-withdraw',
        item_name_raw: '창 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: -10,
        unique_name: key.unique_name,
      },
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-02T01:00:00Z',
        player: 'A-after-deposit',
        item_name_raw: '창 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: 5,
        unique_name: key.unique_name,
      },
      {
        guild_id: tenantA.guildId,
        logged_at: '2026-05-02T02:00:00Z',
        player: 'A-after-withdraw',
        item_name_raw: '창 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: -2,
        unique_name: key.unique_name,
      },
      {
        guild_id: tenantB.guildId,
        logged_at: '2026-05-02T00:00:00Z',
        player: 'B-after',
        item_name_raw: '창 테스트',
        enchant: key.enchant,
        quality: key.quality,
        quantity: 50,
        unique_name: key.unique_name,
      },
    ])
    expect(logErr).toBeNull()

    const { data: drift, error } = await client.rpc('rebuild_shop_inventory_from_chest_logs', {
      p_guild_id: tenantA.guildId,
      p_start_at: '2026-05-02T00:00:00Z',
    })

    expect(error).toBeNull()
    expect((drift as Record<string, unknown>).before_total).toBe(111)
    expect((drift as Record<string, unknown>).after_total).toBe(3)

    const { data: tenantARow } = await client
      .from('shop_inventory')
      .select('stock, manual_price, category, tier')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', key.unique_name)
      .single()
    expect(tenantARow?.stock).toBe(3)
    expect(tenantARow?.manual_price).toBe(777)
    expect(tenantARow?.category).toBe('melee')
    expect(tenantARow?.tier).toBe(6)

    const { data: zeroRow } = await client
      .from('shop_inventory')
      .select('stock, manual_price, price_source')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', zeroKey.unique_name)
      .single()
    expect(zeroRow?.stock).toBe(0)
    expect(zeroRow?.manual_price).toBe(999)
    expect(zeroRow?.price_source).toBe('manual')

    const { data: tenantBRow } = await client
      .from('shop_inventory')
      .select('stock')
      .eq('guild_id', tenantB.guildId)
      .eq('unique_name', key.unique_name)
      .single()
    expect(tenantBRow?.stock).toBe(42)
  })
})

describeIntegration('exchange_requests tenant scope', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('exchange-a')
    tenantB = await createTestTenant('exchange-b')
    await Promise.all([
      enableTestTenantFeatures(tenantA.guildId, ['guild_economy']),
      enableTestTenantFeatures(tenantB.guildId, ['guild_economy']),
    ])
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('allows one pending exchange per member in each tenant', async () => {
    const client = getTestServiceClient()
    const discordId = `exchange-${crypto.randomUUID()}`
    const base = {
      discord_id: discordId,
      username: 'Exchange Member',
      silver: 1000,
      status: 'pending',
      held_points: 1000,
      hold_status: 'held',
      held_at: new Date().toISOString(),
    }

    const { error: errA } = await client
      .from('exchange_requests')
      .insert({ guild_id: tenantA.guildId, ...base })
    expect(errA).toBeNull()

    const { error: errB } = await client
      .from('exchange_requests')
      .insert({ guild_id: tenantB.guildId, ...base })
    expect(errB).toBeNull()

    const { error: duplicateErr } = await client
      .from('exchange_requests')
      .insert({ guild_id: tenantA.guildId, ...base, silver: 2000, held_points: 2000 })
    expect(duplicateErr?.code).toBe('23505')
  })
})

describeIntegration('killboard_events tenant scope (mig 156)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('killboard-a')
    tenantB = await createTestTenant('killboard-b')
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('allows the same Albion event_id and role across different tenants', async () => {
    const client = getTestServiceClient()
    const baseRow = {
      event_id: 910001,
      role: 'killer',
      discord_id: null,
      albion_player_id: 'albion-player-1',
      player_name: 'Player One',
      opponent_name: 'Enemy',
      opponent_guild: 'Enemy Guild',
      fame: 1000,
      item_power: 1400,
      occurred_at: '2026-05-01T00:00:00Z',
      battle_id: 700001,
    }

    const { error: errA } = await client
      .from('killboard_events')
      .insert({ guild_id: tenantA.guildId, ...baseRow })
    expect(errA).toBeNull()

    const { error: errB } = await client
      .from('killboard_events')
      .insert({ guild_id: tenantB.guildId, ...baseRow })
    expect(errB).toBeNull()
  })

  it('still rejects duplicate Albion event_id and role inside the same tenant', async () => {
    const client = getTestServiceClient()
    const baseRow = {
      guild_id: tenantA.guildId,
      event_id: 910002,
      role: 'victim',
      discord_id: null,
      albion_player_id: 'albion-player-2',
      player_name: 'Player Two',
      opponent_name: 'Enemy',
      opponent_guild: 'Enemy Guild',
      fame: 2000,
      item_power: 1300,
      occurred_at: '2026-05-01T00:05:00Z',
      battle_id: 700002,
    }

    const { error: errFirst } = await client.from('killboard_events').insert(baseRow)
    expect(errFirst).toBeNull()

    const { error: errDup } = await client.from('killboard_events').insert(baseRow)
    expect(errDup?.code).toBe('23505')
  })
})
