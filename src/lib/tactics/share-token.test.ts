import { describe, expect, it } from 'vitest'
import {
  createTacticShareToken,
  hashTacticShareToken,
  isValidTacticShareToken,
} from './share-token'

describe('tactic share tokens', () => {
  it('creates URL-safe tokens and stores only deterministic hashes', () => {
    const token = createTacticShareToken()
    const hash = hashTacticShareToken(token)

    expect(isValidTacticShareToken(token)).toBe(true)
    expect(hash).not.toBe(token)
    expect(hash).toBe(hashTacticShareToken(token))
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects malformed tokens before querying the database', () => {
    expect(isValidTacticShareToken('')).toBe(false)
    expect(isValidTacticShareToken('../not-safe')).toBe(false)
    expect(isValidTacticShareToken('short')).toBe(false)
  })
})
