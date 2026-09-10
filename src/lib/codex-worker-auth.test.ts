import { describe, expect, it } from 'vitest'
import {
  CODEX_WORKER_SIGNATURE_MAX_AGE_MS,
  createCodexWorkerSignature,
  verifyCodexWorkerSignature,
} from './codex-worker-auth'

describe('Codex worker request authentication', () => {
  const secret = 'a-secure-worker-secret-that-is-long-enough'
  const timestamp = '1789000000000'
  const request = {
    secret,
    method: 'POST',
    path: '/api/internal/codex/jobs/claim',
    timestamp,
    body: '{"workerId":"local:1"}',
  }

  it('accepts an intact fresh signature', () => {
    const signature = createCodexWorkerSignature(request)
    expect(verifyCodexWorkerSignature({
      ...request,
      signature,
      nowMs: Number(timestamp) + 1000,
    })).toBe(true)
  })

  it('rejects tampering, stale timestamps, and short secrets', () => {
    const signature = createCodexWorkerSignature(request)
    expect(verifyCodexWorkerSignature({
      ...request,
      body: '{"workerId":"attacker"}',
      signature,
      nowMs: Number(timestamp),
    })).toBe(false)
    expect(verifyCodexWorkerSignature({
      ...request,
      signature,
      nowMs: Number(timestamp) + CODEX_WORKER_SIGNATURE_MAX_AGE_MS + 1,
    })).toBe(false)
    expect(verifyCodexWorkerSignature({
      ...request,
      secret: 'short',
      signature,
      nowMs: Number(timestamp),
    })).toBe(false)
  })
})
