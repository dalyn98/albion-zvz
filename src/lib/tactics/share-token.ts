import { createHash, randomBytes } from 'node:crypto'

const TACTIC_SHARE_TOKEN_BYTES = 24
const TACTIC_SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/
export const TACTIC_SHARE_TTL_DAYS = 7

export function createTacticShareToken(): string {
  return randomBytes(TACTIC_SHARE_TOKEN_BYTES).toString('base64url')
}

export function hashTacticShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isValidTacticShareToken(token: string): boolean {
  return TACTIC_SHARE_TOKEN_PATTERN.test(token)
}

export function defaultTacticShareExpiresAt(now = new Date()): Date {
  return new Date(
    now.getTime() + TACTIC_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000,
  )
}

export function isTacticShareLinkUsable(
  link: { expiresAt: string; revokedAt: string | null },
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(link.expiresAt)
  return (
    link.revokedAt === null &&
    Number.isFinite(expiresAt) &&
    expiresAt > now.getTime()
  )
}
