import { createHash } from 'node:crypto'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DISCORD_SNOWFLAKE_RE = /^\d{5,30}$/

export function isApplicationCommandIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

function uuidFromDigest(parts: readonly string[]): string {
  const bytes = createHash('sha256')
    .update(parts.join('\u001f'), 'utf8')
    .digest()
    .subarray(0, 16)
  // RFC 4122 variant + deterministic v5-shaped UUID. SHA-256 is used instead
  // of SHA-1, but the version bits intentionally communicate name stability.
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

export function deriveDiscordConfirmationIdempotencyKey(input: {
  guildId: string
  interactionId: string
  confirmationToken: string
  commandName: string
}): string {
  if (!UUID_RE.test(input.guildId) || !UUID_RE.test(input.confirmationToken)) {
    throw new Error('application_command_confirmation_identity_invalid')
  }
  if (!DISCORD_SNOWFLAKE_RE.test(input.interactionId)) {
    throw new Error('application_command_interaction_invalid')
  }
  return uuidFromDigest([
    'agm-application-command-v1',
    input.guildId,
    input.interactionId,
    input.confirmationToken,
    input.commandName,
  ])
}

export function stableApplicationCommandJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableApplicationCommandJson(entry)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableApplicationCommandJson(record[key])}`)
    .join(',')}}`
}
