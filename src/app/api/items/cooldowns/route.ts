import { NextRequest, NextResponse } from 'next/server'
import { computeEffectiveCd } from '@/lib/cooldown'
import { CDR_SLOT_KEYS, type CooldownSlotPayload } from '@/lib/cooldown-request'

const MAX_BATCH_SIZE = 50
const MAX_BODY_LENGTH = 100_000
const MAX_TEXT_LENGTH = 160
const ITEM_ID_RE = /^[A-Za-z0-9_@.-]+$/
const SPELL_ID_RE = /^[A-Za-z0-9_@.-]+$/

function payloadTooLarge(request: NextRequest): boolean {
  const value = request.headers.get('content-length')
  if (!value) return false
  const contentLength = Number(value)
  return Number.isFinite(contentLength) && contentLength > MAX_BODY_LENGTH
}

function payloadTooLargeResponse(): NextResponse {
  return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
}

function safeText(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH ? value : null
}

function safeItemId(value: unknown): string | null {
  const text = safeText(value)
  return text && ITEM_ID_RE.test(text) ? text : null
}

function sanitizeSlot(value: unknown): CooldownSlotPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const slot: Record<string, unknown> = {}
  for (const key of CDR_SLOT_KEYS) {
    slot[`${key}_id`] = safeItemId(input[`${key}_id`])
    slot[`${key}_name`] = safeText(input[`${key}_name`])
    slot[`assigned_${key}_id`] = safeItemId(input[`assigned_${key}_id`])
    slot[`assigned_${key}_name`] = safeText(input[`assigned_${key}_name`])
    const options = input[`${key}_options`]
    slot[`${key}_options`] = Array.isArray(options) && options.length > 0 ? [{}] : []
  }
  return slot as CooldownSlotPayload
}

export async function POST(request: NextRequest) {
  if (payloadTooLarge(request)) return payloadTooLargeResponse()

  const rawBody = await request.text()
  if (rawBody.length > MAX_BODY_LENGTH) {
    return payloadTooLargeResponse()
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const entries = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as { entries?: unknown }).entries
    : null
  if (!Array.isArray(entries) || entries.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: 'invalid_batch' }, { status: 400 })
  }

  const results: Record<string, ReturnType<typeof computeEffectiveCd>> = {}
  for (const rawEntry of entries) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) continue
    const entry = rawEntry as Record<string, unknown>
    const key = safeText(entry.key)
    const spellId = safeText(entry.spellId)
    if (!key || !spellId || !SPELL_ID_RE.test(spellId)) continue
    results[key] = computeEffectiveCd(
      sanitizeSlot(entry.slot) as Parameters<typeof computeEffectiveCd>[0],
      spellId,
    )
  }

  return NextResponse.json({ results })
}
