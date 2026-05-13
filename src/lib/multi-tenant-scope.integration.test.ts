import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createTestTenant,
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

describeIntegration('shop_inventory tenant scope (mig 130)', () => {
  let tenantA: TestTenant
  let tenantB: TestTenant

  beforeEach(async () => {
    tenantA = await createTestTenant('shop-a')
    tenantB = await createTestTenant('shop-b')
  })

  afterEach(async () => {
    await tenantA?.cleanup()
    await tenantB?.cleanup()
  })

  it('allows the same (unique_name, enchant, quality) across different tenants', async () => {
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

  it('rejects duplicate (unique_name, enchant, quality) within the same tenant', async () => {
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
      .insert({ guild_id: tenantA.guildId, ...row })
    // Postgres unique_violation
    expect(errDup?.code).toBe('23505')
  })

  it('ON CONFLICT (guild_id, unique_name, enchant, quality) upserts within tenant scope', async () => {
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
        { onConflict: 'guild_id,unique_name,enchant,quality' },
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
        { onConflict: 'guild_id,unique_name,enchant,quality' },
      )
    expect(errUpsertB).toBeNull()

    const { data: aRows } = await client
      .from('shop_inventory')
      .select('stock')
      .eq('guild_id', tenantA.guildId)
      .eq('unique_name', baseRow.unique_name)
      .eq('enchant', baseRow.enchant)
      .eq('quality', baseRow.quality)
    expect(aRows?.[0]?.stock).toBe(99) // tenant A 의 값은 보존
  })
})
