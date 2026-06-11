import { createHash, randomBytes } from 'node:crypto'

const TACTIC_SHARE_TOKEN_BYTES = 24
const TACTIC_SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/

export function createTacticShareToken(): string {
  return randomBytes(TACTIC_SHARE_TOKEN_BYTES).toString('base64url')
}

export function hashTacticShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isValidTacticShareToken(token: string): boolean {
  return TACTIC_SHARE_TOKEN_PATTERN.test(token)
}
