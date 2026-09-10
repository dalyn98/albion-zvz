import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const CODEX_WORKER_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000

function signingPayload(input: {
  method: string
  path: string
  timestamp: string
  body: string
}): string {
  const bodyHash = createHash('sha256').update(input.body, 'utf8').digest('hex')
  return [input.timestamp, input.method.toUpperCase(), input.path, bodyHash].join('.')
}

export function createCodexWorkerSignature(input: {
  secret: string
  method: string
  path: string
  timestamp: string
  body: string
}): string {
  if (input.secret.length < 32) throw new Error('CODEX_WORKER_SECRET must be at least 32 characters')
  return createHmac('sha256', input.secret)
    .update(signingPayload(input), 'utf8')
    .digest('hex')
}

export function verifyCodexWorkerSignature(input: {
  secret: string
  method: string
  path: string
  timestamp: string | null
  body: string
  signature: string | null
  nowMs?: number
}): boolean {
  if (input.secret.length < 32 || !input.timestamp || !input.signature) return false
  if (!/^\d{13}$/.test(input.timestamp) || !/^[a-f0-9]{64}$/i.test(input.signature)) return false
  const timestampMs = Number(input.timestamp)
  if (!Number.isSafeInteger(timestampMs)) return false
  const age = Math.abs((input.nowMs ?? Date.now()) - timestampMs)
  if (age > CODEX_WORKER_SIGNATURE_MAX_AGE_MS) return false

  let expected: Buffer
  let received: Buffer
  try {
    expected = Buffer.from(createCodexWorkerSignature({
      secret: input.secret,
      method: input.method,
      path: input.path,
      timestamp: input.timestamp,
      body: input.body,
    }), 'hex')
    received = Buffer.from(input.signature, 'hex')
  } catch {
    return false
  }
  return expected.length === received.length && timingSafeEqual(expected, received)
}
