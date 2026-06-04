import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hashSecret,
  isLocalAccountSubject,
  isValidLocalGuildInviteCode,
  isValidLocalAccountPassword,
  normalizeLocalAccountName,
  touchLocalGuildAccountLogin,
  verifySecret,
} from './local-guild-account'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

interface QueryCall {
  method: string
  args: unknown[]
}

function createUpdateQuery(calls: QueryCall[]) {
  const query = {
    update(payload: Record<string, unknown>) {
      calls.push({ method: 'update', args: [payload] })
      return query
    },
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    then(resolve: (value: { error: null }) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve({ error: null }).then(resolve, reject)
    },
  }
  return query
}

describe('local guild account helpers', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
  })

  it('hashes and verifies invite/password secrets without storing plaintext', () => {
    const hash = hashSecret('guild-pass-123')

    expect(hash).not.toContain('guild-pass-123')
    expect(verifySecret('guild-pass-123', hash)).toBe(true)
    expect(verifySecret('wrong-pass', hash)).toBe(false)
  })

  it('normalizes account names and detects synthetic local subjects', () => {
    expect(normalizeLocalAccountName('  Monkku   Healer  ')).toBe('Monkku Healer')
    expect(isLocalAccountSubject('local:1234')).toBe(true)
    expect(isLocalAccountSubject('1234')).toBe(false)
  })

  it('rejects weak or control-character passwords', () => {
    expect(isValidLocalAccountPassword('1234567')).toBe(false)
    expect(isValidLocalAccountPassword('valid-pass')).toBe(true)
    expect(isValidLocalAccountPassword('valid\u0000pass')).toBe(false)
  })

  it('validates local guild invite codes before hashing or verification', () => {
    expect(isValidLocalGuildInviteCode('12345')).toBe(false)
    expect(isValidLocalGuildInviteCode('invite-code')).toBe(true)
    expect(isValidLocalGuildInviteCode('x'.repeat(73))).toBe(false)
    expect(isValidLocalGuildInviteCode('valid\u0000code')).toBe(false)
  })

  it('scopes local account login touch by guild and account id', async () => {
    const calls: QueryCall[] = []
    const query = createUpdateQuery(calls)
    const from = vi.fn((table: string) => {
      if (table !== 'guild_local_accounts') throw new Error(`Unexpected table: ${table}`)
      return query
    })
    mocks.getAdminClient.mockReturnValue({ from })

    await touchLocalGuildAccountLogin('guild-1', 'account-1')

    expect(calls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['id', 'account-1'] })
  })
})
