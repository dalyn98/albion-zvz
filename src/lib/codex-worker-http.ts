import 'server-only'

import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { verifyCodexWorkerSignature } from '@/lib/codex-worker-auth'

export type SignedWorkerBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }

export async function parseSignedCodexWorkerBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<SignedWorkerBody<T>> {
  const secret = process.env.CODEX_WORKER_SECRET?.trim() ?? ''
  if (secret.length < 32) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'codex_worker_not_configured' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ),
    }
  }
  const body = await request.text()
  const path = new URL(request.url).pathname
  const verified = verifyCodexWorkerSignature({
    secret,
    method: request.method,
    path,
    timestamp: request.headers.get('x-codex-timestamp'),
    signature: request.headers.get('x-codex-signature'),
    body,
  })
  if (!verified) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ),
    }
  }
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'invalid_json' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      ),
    }
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'invalid_request' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      ),
    }
  }
  return { ok: true, data: parsed.data }
}
export function codexWorkerJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
