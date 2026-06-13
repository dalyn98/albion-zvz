const DISCORD_SNOWFLAKE_RE = /^\d{15,25}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REASON_MAX_LENGTH = 500

export interface MemberAccountMergeInput {
  guildId: string
  fromDiscordId: string
  toDiscordId: string
  reason?: string | null
}

export interface NormalizedMemberAccountMergeInput {
  guildId: string
  fromDiscordId: string
  toDiscordId: string
  reason: string | null
}

export type MemberAccountMergeNormalizeResult =
  | { ok: true; input: NormalizedMemberAccountMergeInput }
  | { ok: false; error: string }

export interface AccountMergeMember {
  discordId: string | null
  username: string | null
  withdrawnAt: string | null
  albionServer: string | null
  albionPlayerId: string | null
  albionPlayerName: string | null
}

export interface AccountMergePreview {
  canMerge: boolean
  blockers: string[]
  warnings: string[]
  counts: Record<string, number>
  source: AccountMergeMember | null
  target: AccountMergeMember | null
}

export interface AccountMergeExecutionResult extends AccountMergePreview {
  moved: Record<string, number>
}

export type AccountMergePreviewResult =
  | { ok: true; preview: AccountMergePreview }
  | { ok: false; error: string }

export type AccountMergeExecutionResponse =
  | { ok: true; result: AccountMergeExecutionResult }
  | { ok: false; error: string }

type AccountMergeRpcResult = {
  data: unknown
  error: { message: string } | null
}

export interface AccountMergeRpcClient {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<AccountMergeRpcResult>
}

export interface ExecuteMemberAccountMergeInput extends MemberAccountMergeInput {
  actorDiscordId: string
  confirmation: string
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeDiscordId(value: unknown, label: string): { ok: true; value: string } | { ok: false; error: string } {
  const normalized = normalizeString(value)
  if (!DISCORD_SNOWFLAKE_RE.test(normalized)) {
    return { ok: false, error: `${label} must be a numeric snowflake` }
  }
  return { ok: true, value: normalized }
}

function normalizeReason(value: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const normalized = normalizeString(value)
  if (!normalized) return { ok: true, value: null }
  if (normalized.length > REASON_MAX_LENGTH) {
    return { ok: false, error: `reason must be ${REASON_MAX_LENGTH} chars or less` }
  }
  return { ok: true, value: normalized }
}

export function normalizeMemberAccountMergeInput(raw: {
  guildId?: unknown
  fromDiscordId?: unknown
  toDiscordId?: unknown
  reason?: unknown
}): MemberAccountMergeNormalizeResult {
  const guildId = normalizeString(raw.guildId)
  if (!UUID_RE.test(guildId)) return { ok: false, error: 'tenant ID must be a UUID' }

  const from = normalizeDiscordId(raw.fromDiscordId, 'source Discord ID')
  if (!from.ok) return { ok: false, error: from.error }

  const to = normalizeDiscordId(raw.toDiscordId, 'target Discord ID')
  if (!to.ok) return { ok: false, error: to.error }

  if (from.value === to.value) {
    return { ok: false, error: 'source and target Discord IDs must be different' }
  }

  const reason = normalizeReason(raw.reason)
  if (!reason.ok) return { ok: false, error: reason.error }

  return {
    ok: true,
    input: {
      guildId,
      fromDiscordId: from.value,
      toDiscordId: to.value,
      reason: reason.value,
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function numberRecord(value: unknown): Record<string, number> {
  const record = asRecord(value)
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      const numeric = typeof item === 'number' ? item : Number(item)
      return [key, Number.isFinite(numeric) ? numeric : 0]
    }),
  )
}

function parseMember(value: unknown): AccountMergeMember | null {
  if (value === null || value === undefined) return null
  const record = asRecord(value)
  return {
    discordId: optionalString(record.discordId),
    username: optionalString(record.username),
    withdrawnAt: optionalString(record.withdrawnAt),
    albionServer: optionalString(record.albionServer),
    albionPlayerId: optionalString(record.albionPlayerId),
    albionPlayerName: optionalString(record.albionPlayerName),
  }
}

function parsePreviewPayload(value: unknown): AccountMergePreview {
  const record = asRecord(value)
  const blockers = stringArray(record.blockers)
  return {
    canMerge: typeof record.canMerge === 'boolean' ? record.canMerge : blockers.length === 0,
    blockers,
    warnings: stringArray(record.warnings),
    counts: numberRecord(record.counts),
    source: parseMember(record.source),
    target: parseMember(record.target),
  }
}

function parseExecutionPayload(value: unknown): AccountMergeExecutionResult {
  const record = asRecord(value)
  return {
    ...parsePreviewPayload(value),
    moved: numberRecord(record.moved),
  }
}

export async function previewMemberAccountMerge(
  db: AccountMergeRpcClient,
  rawInput: MemberAccountMergeInput,
): Promise<AccountMergePreviewResult> {
  const normalized = normalizeMemberAccountMergeInput(rawInput)
  if (!normalized.ok) return normalized

  const { input } = normalized
  const { data, error } = await db.rpc('preview_member_account_merge', {
    p_guild_id: input.guildId,
    p_from_discord_id: input.fromDiscordId,
    p_to_discord_id: input.toDiscordId,
  })
  if (error) return { ok: false, error: `account merge preview failed: ${error.message}` }

  return { ok: true, preview: parsePreviewPayload(data) }
}

export async function executeMemberAccountMerge(
  db: AccountMergeRpcClient,
  rawInput: ExecuteMemberAccountMergeInput,
): Promise<AccountMergeExecutionResponse> {
  if (rawInput.confirmation !== 'MERGE') return { ok: false, error: 'confirmation must be MERGE' }

  const normalized = normalizeMemberAccountMergeInput(rawInput)
  if (!normalized.ok) return normalized

  const actor = normalizeDiscordId(rawInput.actorDiscordId, 'actor Discord ID')
  if (!actor.ok) return { ok: false, error: actor.error }

  const { input } = normalized
  const { data, error } = await db.rpc('merge_member_accounts', {
    p_guild_id: input.guildId,
    p_from_discord_id: input.fromDiscordId,
    p_to_discord_id: input.toDiscordId,
    p_actor_discord_id: actor.value,
    p_reason: input.reason,
  })
  if (error) return { ok: false, error: `account merge failed: ${error.message}` }

  return { ok: true, result: parseExecutionPayload(data) }
}
