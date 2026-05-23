import { describe, expect, it } from 'vitest'
import {
  hashSecret,
  isLocalAccountSubject,
  isValidLocalAccountPassword,
  normalizeLocalAccountName,
  verifySecret,
} from './local-guild-account'

describe('local guild account helpers', () => {
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
})
