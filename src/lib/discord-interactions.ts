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

export const INTERACTION_RESPONSE_TYPE_PONG = 1
export const INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE = 4

// `flags: 64` (1 << 6) = EPHEMERAL — 명령을 친 본인만 보임. 공개 채널을
// 어지럽히지 않으려고 모든 응답에 적용한다.
export const MESSAGE_FLAG_EPHEMERAL = 1 << 6
export const DISCORD_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000

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

export interface DiscordInteractionOption {
  name: string
  type: number
  value?: string | number | boolean
  options?: DiscordInteractionOption[]
}

// Discord 가 보내는 interaction payload. 우리는 슬래시 커맨드 (type 2) 만
// 처리하므로 그쪽 필드만 명시. 다른 type 은 그대로 무시.
export interface DiscordInteractionPayload {
  id: string
  type: number
  // 슬래시 커맨드 본문. type 1 (PING) 에는 없다.
  data?: {
    id: string
    name: string
    type: number
    options?: DiscordInteractionOption[]
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
    content?: string
    flags?: number
  }
}

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
export function ephemeralReply(content: string): DiscordInteractionResponse {
  return {
    type: INTERACTION_RESPONSE_TYPE_CHANNEL_MESSAGE,
    data: {
      content,
      flags: MESSAGE_FLAG_EPHEMERAL,
    },
  }
}
