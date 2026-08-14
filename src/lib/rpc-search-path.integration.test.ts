import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  getTestServiceClient,
  getValidatedTestSupabaseEnv,
  hasTestEnv,
} from '@/test/integration-helpers'

const anonKey = process.env.TEST_SUPABASE_ANON_KEY?.trim() ?? ''
const describeIntegration = hasTestEnv() && anonKey ? describe : describe.skip

const missingSlotInput = {
  p_slot_id: crypto.randomUUID(),
  p_discord_id: '999999999999999999',
  p_username: 'Search Path Boundary',
}

describeIntegration('legacy caller assignment security boundary (migration 412)', () => {
  it('keeps the retained RPC callable only through the service role', async () => {
    const env = getValidatedTestSupabaseEnv()
    expect(env).not.toBeNull()
    if (!env) return

    const service = getTestServiceClient()
    const anonymous = createClient(env.url, anonKey, { auth: { persistSession: false } })
    const authenticated = createClient(env.url, anonKey, { auth: { persistSession: false } })
    const email = `caller-rpc-boundary-${crypto.randomUUID()}@example.test`
    const password = `Caller-${crypto.randomUUID()}-Aa1!`
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    expect(created.error).toBeNull()
    expect(created.data.user).not.toBeNull()

    try {
      const signIn = await authenticated.auth.signInWithPassword({ email, password })
      expect(signIn.error).toBeNull()

      const serviceCall = await service.rpc('caller_assign_slot', missingSlotInput)
      expect(serviceCall.error?.message).toContain('SLOT_NOT_FOUND')

      for (const [role, client] of [
        ['anon', anonymous],
        ['authenticated', authenticated],
      ] as const) {
        const blocked = await client.rpc('caller_assign_slot', missingSlotInput)
        expect(blocked.error, role).not.toBeNull()
        expect(blocked.error?.message, role).not.toContain('SLOT_NOT_FOUND')
      }
    } finally {
      if (created.data.user) {
        await service.auth.admin.deleteUser(created.data.user.id)
      }
    }
  })
})
