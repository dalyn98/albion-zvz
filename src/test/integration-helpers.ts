import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Phase 2 통합 테스트 헬퍼. 실 Postgres + Supabase API 가 필요한 테스트가
// 쓰는 공용 픽스처. 단위 테스트(src/lib/*.test.ts) 는 이 모듈을 import 하지
// 않는다 — Supabase 연결 시도 자체가 없어야 한다.
//
// 환경 변수 정책:
//   - TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_KEY 가 둘 다 있어야 통합
//     테스트가 활성화된다. 부재 시 hasTestEnv() === false → describe.skip 으로
//     안전 통과.
//   - 사용 중인 production .env (NEXT_PUBLIC_SUPABASE_URL 등) 와 절대 공유
//     금지. 한 번 실수로 prod 를 가리키면 tenants 테이블에 테스트 길드를 만들고
//     CASCADE 로 다른 테넌트의 데이터까지 손상시킬 수 있다.

const TEST_SUPABASE_URL = process.env.TEST_SUPABASE_URL
const TEST_SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY

export function hasTestEnv(): boolean {
  return Boolean(TEST_SUPABASE_URL && TEST_SUPABASE_SERVICE_KEY)
}

export function getTestServiceClient(): SupabaseClient {
  if (!TEST_SUPABASE_URL || !TEST_SUPABASE_SERVICE_KEY) {
    throw new Error(
      'TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_KEY env vars are required for integration tests. ' +
        'See vitest.integration.config.ts header for setup steps.',
    )
  }
  return createClient(TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })
}

export interface TestTenant {
  guildId: string
  discordGuildId: string
  slug: string
  cleanup: () => Promise<void>
}

// 테스트용 tenant 를 만들고 cleanup 핸들을 돌려준다. tenants.id 가
// 다른 핵심 테이블의 FK (ON DELETE CASCADE) 라서 cleanup 한 번이면
// 해당 길드에 속한 모든 child row 가 함께 삭제된다.
export async function createTestTenant(suffix?: string): Promise<TestTenant> {
  const client = getTestServiceClient()
  const id = crypto.randomUUID()
  const tag = suffix ?? id.slice(0, 8)
  const slug = `test-${tag}-${Date.now()}`
  const discordGuildId = `test-discord-${id}`

  const { error } = await client
    .from('tenants')
    .insert({
      id,
      discord_guild_id: discordGuildId,
      slug,
      name: `Test Tenant ${tag}`,
      status: 'active',
      settings: {},
    })

  if (error) {
    throw new Error(`createTestTenant failed: ${error.message}`)
  }

  return {
    guildId: id,
    discordGuildId,
    slug,
    cleanup: async () => {
      const { error: delErr } = await client.from('tenants').delete().eq('id', id)
      if (delErr) {
        console.warn(`[integration cleanup] tenants delete failed for ${id}: ${delErr.message}`)
      }
    },
  }
}
