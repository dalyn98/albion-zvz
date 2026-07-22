// Discord Interactions endpoint helpers — Ed25519 서명 검증 + 응답 빌더 + 타입.
//
// Discord 는 슬래시 커맨드 요청을 우리 서버로 POST 보내고, 모든 요청에는
// Ed25519 서명이 헤더로 붙는다. 검증 실패 시 401 을 응답해야 Discord 가
// 엔드포인트를 살아 있다고 인정한다 (Interactions Endpoint URL 검증 포함).
//
// 검증은 Node native `crypto.verify('ed25519', ...)` 를 쓴다 — webcrypto 의
// Ed25519 는 Node 버전별 안정성 차이가 있고, 새 dependency 없이 처리하기 위해
// node:crypto 직접 사용. (Vercel Functions 는 Node 24 LTS 기본.)
//
// 표준 참고: https://discord.com/developers/docs/interactions/receiving-and-responding

import { createPublicKey, verify as cryptoVerify } from 'node:crypto'

export const INTERACTION_TYPE_PING = 1
export const INTERACTION_TYPE_APPLICATION_COMMAND = 2
export const INTERACTION_TYPE_MESSAGE_COMPONENT = 3
export const INTERACTION_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE = 4
export const INTERACTION_TYPE_MODAL_SUBMIT = 5

export const INTERACTION_RESPONSE_TYPE_PONG = 1
export const INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE = 4
export const INTERACTION_RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE = 5
export const INTERACTION_RESPONSE_TYPE_DEFERRED_UPDATE_MESSAGE = 6
export const INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE = 7
export const INTERACTION_RESPONSE_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE_RESULT = 8
export const INTERACTION_RESPONSE_TYPE_MODAL = 9

// `flags: 64` (1 << 6) = EPHEMERAL — 명령을 친 본인만 보임. 공개 채널을
// 어지럽히지 않으려고 모든 응답에 적용한다.
export const MESSAGE_FLAG_EPHEMERAL = 1 << 6
// `flags: 4` (1 << 2) = SUPPRESS_EMBEDS — bearer URL 을 Discord 본문에
// 실수로 포함했을 때 link unfurl 이 선제 GET 하지 않도록 막는다.
export const MESSAGE_FLAG_SUPPRESS_EMBEDS = 1 << 2
export const DISCORD_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000
export const DISCORD_INTERACTION_CONTENT_MAX_LENGTH = 2_000

export interface DiscordInteractionUser {
  id: string
  username: string
  global_name?: string | null
}

export interface DiscordInteractionMember {
  user?: DiscordInteractionUser
  nick?: string | null
  roles?: string[]
  permissions?: string
}

export interface DiscordInteractionResolvedMember {
  nick?: string | null
}

export interface DiscordInteractionOption {
  name: string
  type: number
  value?: string | number | boolean
  focused?: boolean
  options?: DiscordInteractionOption[]
}

// Discord 가 보내는 interaction payload. type 별로 data shape 이 조금씩
// 다르므로 공통 필드는 optional 로 둔다.
export interface DiscordInteractionPayload {
  id: string
  application_id?: string
  token?: string
  type: number
  // type 1 (PING) 에는 없다.
  data?: {
    id?: string
    name?: string
    type?: number
    custom_id?: string
    component_type?: number
    values?: string[]
    components?: DiscordModalActionRowComponent[]
    options?: DiscordInteractionOption[]
    resolved?: {
      users?: Record<string, DiscordInteractionUser>
      members?: Record<string, DiscordInteractionResolvedMember>
    }
  }
  // 길드 안에서 친 명령이면 채워짐. DM 에서 친 명령이면 null/undefined.
  guild_id?: string
  // 명령이 실행된 채널. 현재 /agm 은 상태 변경을 하지 않지만 Discord payload 를
  // 있는 그대로 모델링한다.
  channel_id?: string
  // 유저의 디스코드 클라이언트 언어 (BCP-47).
  locale?: string
  // 명령이 실행된 Discord 서버의 기본 언어. 현재 명령 응답은 사이트에 저장된
  // 사용자 언어 설정을 우선 사용하므로 타입만 보존한다.
  guild_locale?: string
  member?: DiscordInteractionMember
  user?: DiscordInteractionUser
}

export interface DiscordInteractionResponse {
  type: number
  data?: {
    custom_id?: string
    title?: string
    content?: string
    flags?: number
    components?: DiscordMessageComponent[]
    choices?: DiscordAutocompleteChoice[]
  }
}

export interface DiscordAutocompleteChoice {
  name: string
  value: string | number
}

export interface DiscordInteractionWebhookMessage {
  content?: string
  components?: DiscordMessageComponent[]
  allowed_mentions?: {
    parse?: ('everyone' | 'roles' | 'users')[]
    roles?: string[]
    users?: string[]
  }
}

export interface DiscordButtonComponent {
  type: 2
  style: 1 | 2 | 3 | 4 | 5
  label: string
  custom_id?: string
  emoji?: {
    name: string
    id?: string
    animated?: boolean
  }
  url?: string
  disabled?: boolean
}

export interface DiscordStringSelectOption {
  label: string
  value: string
  description?: string
  default?: boolean
}

export interface DiscordStringSelectComponent {
  type: 3
  custom_id: string
  options: DiscordStringSelectOption[]
  placeholder?: string
  min_values?: number
  max_values?: number
  disabled?: boolean
}

export interface DiscordTextInputComponent {
  type: 4
  custom_id: string
  style: 1 | 2
  label: string
  placeholder?: string
  min_length?: number
  max_length?: number
  required?: boolean
  value?: string
}

export interface DiscordActionRowComponent {
  type: 1
  components: Array<DiscordButtonComponent | DiscordStringSelectComponent>
}

export interface DiscordModalActionRowComponent {
  type: 1
  components: DiscordTextInputComponent[]
}

export type DiscordMessageComponent = DiscordActionRowComponent | DiscordModalActionRowComponent

export function isDiscordSignatureTimestampFresh(
  timestamp: string,
  options: {
    nowMs?: number
    maxAgeMs?: number
  } = {},
): boolean {
  if (!/^\d+$/.test(timestamp)) return false
  const signedAtSeconds = Number(timestamp)
  if (!Number.isSafeInteger(signedAtSeconds)) return false

  const nowMs = options.nowMs ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? DISCORD_SIGNATURE_MAX_AGE_MS
  const ageMs = nowMs - signedAtSeconds * 1000
  return Math.abs(ageMs) <= maxAgeMs
}

// Discord 의 ed25519 public key 는 64 자 hex string 으로 제공된다 (32 bytes).
// 검증 실패는 throw 하지 않고 false 를 돌려 호출자가 401 로 처리하게 한다.
export function verifyDiscordSignature(options: {
  publicKeyHex: string
  signatureHex: string
  timestamp: string
  rawBody: string
}): boolean {
  const { publicKeyHex, signatureHex, timestamp, rawBody } = options
  if (!publicKeyHex || !signatureHex || !timestamp || !rawBody) return false

  let signature: Buffer
  let publicKeyDer: Buffer
  try {
    signature = Buffer.from(signatureHex, 'hex')
    if (signature.length !== 64) return false
    const rawKey = Buffer.from(publicKeyHex, 'hex')
    if (rawKey.length !== 32) return false
    // Node 의 verify('ed25519', ...) 는 raw 32-byte key 를 직접 못 받는다 —
    // SPKI DER 로 감싸야 한다. Ed25519 OID = 1.3.101.112. 0x302a 는 SEQUENCE
    // 길이 (42 bytes), 0x3005 0x0603 2b 65 70 = AlgorithmIdentifier(Ed25519),
    // 0x0321 00 = BIT STRING 33 bytes (1 byte unused-bits=0 + 32 byte key).
    publicKeyDer = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      rawKey,
    ])
  } catch {
    return false
  }

  try {
    const keyObject = createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki',
    })
    const message = Buffer.from(timestamp + rawBody, 'utf8')
    return cryptoVerify(null, message, keyObject, signature)
  } catch {
    return false
  }
}

// Ephemeral 텍스트 응답 빌더 — 모든 슬래시 커맨드 응답에 사용.
export function ephemeralReply(
  content: string,
  options: { components?: DiscordMessageComponent[]; suppressEmbeds?: boolean } = {},
): DiscordInteractionResponse {
  return {
    type: INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
    data: {
      content: content.slice(0, DISCORD_INTERACTION_CONTENT_MAX_LENGTH),
      flags:
        MESSAGE_FLAG_EPHEMERAL |
        (options.suppressEmbeds ? MESSAGE_FLAG_SUPPRESS_EMBEDS : 0),
      ...(options.components ? { components: options.components } : {}),
    },
  }
}

export function deferredEphemeralReply(): DiscordInteractionResponse {
  return {
    type: INTERACTION_RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE,
    data: {
      flags: MESSAGE_FLAG_EPHEMERAL,
    },
  }
}

export function autocompleteReply(
  choices: readonly DiscordAutocompleteChoice[],
): DiscordInteractionResponse {
  return {
    type: INTERACTION_RESPONSE_TYPE_APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
    data: {
      choices: choices.slice(0, 25).map((choice) => ({
        name: choice.name.slice(0, 100),
        value: typeof choice.value === 'string' ? choice.value.slice(0, 100) : choice.value,
      })),
    },
  }
}

export function deferredMessageUpdate(): DiscordInteractionResponse {
  return {
    type: INTERACTION_RESPONSE_TYPE_DEFERRED_UPDATE_MESSAGE,
  }
}

export function messageUpdateReply(
  content: string,
  options: { components?: DiscordMessageComponent[] } = {},
): DiscordInteractionResponse {
  return {
    type: INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE,
    data: {
      content: content.slice(0, DISCORD_INTERACTION_CONTENT_MAX_LENGTH),
      ...(options.components ? { components: options.components } : {}),
    },
  }
}

export function modalReply(input: {
  customId: string
  title: string
  components: DiscordModalActionRowComponent[]
}): DiscordInteractionResponse {
  return {
    type: INTERACTION_RESPONSE_TYPE_MODAL,
    data: {
      custom_id: input.customId,
      title: input.title,
      components: input.components,
    },
  }
}

export function interactionResponseToWebhookMessage(
  response: DiscordInteractionResponse,
): DiscordInteractionWebhookMessage | null {
  if (
    response.type !== INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE &&
    response.type !== INTERACTION_RESPONSE_TYPE_UPDATE_MESSAGE
  ) {
    return null
  }
  if (!response.data) {
    return null
  }
  return {
    ...(response.data.content ? { content: response.data.content } : {}),
    ...(response.data.components ? { components: response.data.components } : {}),
    allowed_mentions: { parse: [] },
  }
}

export async function editOriginalInteractionResponse(
  payload: DiscordInteractionPayload,
  response: DiscordInteractionResponse,
): Promise<void> {
  if (!payload.application_id || !payload.token) {
    throw new Error('Discord interaction follow-up token missing')
  }
  const message = interactionResponseToWebhookMessage(response)
  if (!message) {
    throw new Error(`Unsupported deferred Discord interaction response type: ${response.type}`)
  }

  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${encodeURIComponent(payload.application_id)}/${encodeURIComponent(payload.token)}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Discord interaction follow-up failed (${res.status}): ${text}`)
  }
}
