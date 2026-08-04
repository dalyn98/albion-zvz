import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  resolveBotInstallIntent,
  signAgmBattlesConnectIntent,
  signBotInstallState,
  signOAuthState,
  verifyBotInstallState,
  verifyAgmBattlesConnectIntent,
  verifyOAuthState,
  signHopToken,
  verifyHopToken,
} from './oauth-state'
import type { SessionPayload } from './session'

// 모든 sign/verify 가 process.env.COOKIE_SECRET 을 읽으므로 테스트 진입 전 셋업.
beforeAll(() => {
  vi.stubEnv('COOKIE_SECRET', 'test-cookie-secret-do-not-use-in-prod')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

const SAMPLE_SESSION: SessionPayload = {
  discordId: '111222333',
  username: 'tester',
  avatar: null,
  isMember: true,
  isAdmin: false,
  isGuest: false,
  isBombSquadCaller: false,
  isLocalGuildAccount: false,
  isAllianceCandidate: false,
  canCreateEvents: false,
  eventCreatorCategories: [],
  eventScope: null,
  guildId: 'tenant-uuid',
  capabilities: '0',
  issuedAt: Date.now(),
}

async function signTestPayload(payload: unknown): Promise<string> {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('test-cookie-secret-do-not-use-in-prod'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64),
  )
  return `${payloadB64}.${Buffer.from(signature).toString('base64url')}`
}

describe('signOAuthState / verifyOAuthState', () => {
  it('round-trips: signed value verifies back to the original payload', async () => {
    const token = await signOAuthState({
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/admin/dashboard',
      invite: null,
    })
    const parsed = await verifyOAuthState(token)
    expect(parsed).not.toBeNull()
    expect(parsed?.originHost).toBe('menhera.albion-guildmanager.com')
    expect(parsed?.returnTo).toBe('/admin/dashboard')
    expect(parsed?.invite).toBeNull()
    expect(parsed?.preferredLocale).toBeNull()
    expect(typeof parsed?.nonce).toBe('string')
    expect(parsed?.nonce.length).toBeGreaterThan(0)
  })

  it('carries the invite token when supplied', async () => {
    const token = await signOAuthState({
      originHost: 'sub.example.com',
      returnTo: '/',
      invite: 'inv-abc-123',
    })
    const parsed = await verifyOAuthState(token)
    expect(parsed?.invite).toBe('inv-abc-123')
  })

  it('carries the browser/site locale when supplied', async () => {
    const token = await signOAuthState({
      originHost: 'sub.example.com',
      returnTo: '/events/event-1',
      invite: 'inv-abc-123',
      preferredLocale: 'en',
    })
    const parsed = await verifyOAuthState(token)
    expect(parsed?.preferredLocale).toBe('en')
  })

  it('rejects tampered payloads (signature no longer matches)', async () => {
    const token = await signOAuthState({
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/',
      invite: null,
    })
    const [payloadB64, sigB64] = token.split('.')
    // payload 의 마지막 글자를 살짝 바꿔서 sig 와 어긋나게 한다.
    const lastChar = payloadB64[payloadB64.length - 1]
    const swapped = lastChar === 'A' ? 'B' : 'A'
    const tamperedPayload = payloadB64.slice(0, -1) + swapped
    const tamperedToken = `${tamperedPayload}.${sigB64}`
    expect(await verifyOAuthState(tamperedToken)).toBeNull()
  })

  it('rejects tokens with a tampered signature', async () => {
    const token = await signOAuthState({
      originHost: 'a',
      returnTo: '/',
      invite: null,
    })
    const [payloadB64] = token.split('.')
    // 임의의 (잘못된) 서명. base64url 길이 32바이트 ≈ 43자.
    const fakeSig = 'A'.repeat(43)
    expect(await verifyOAuthState(`${payloadB64}.${fakeSig}`)).toBeNull()
  })

  it('rejects malformed tokens (wrong shape)', async () => {
    expect(await verifyOAuthState(undefined)).toBeNull()
    expect(await verifyOAuthState('')).toBeNull()
    expect(await verifyOAuthState('no-dot-at-all')).toBeNull()
    expect(await verifyOAuthState('too.many.parts.here')).toBeNull()
    expect(await verifyOAuthState('not-base64.also-not')).toBeNull()
  })

  it('rejects tokens older than STATE_MAX_AGE_SECONDS (15분)', async () => {
    // Date.now 를 stub 해서 16분 전에 발급된 토큰을 시뮬레이트.
    const originalNow = Date.now
    try {
      const realNow = originalNow.call(Date)
      Date.now = () => realNow - 16 * 60 * 1000
      const aged = await signOAuthState({
        originHost: 'x',
        returnTo: '/',
        invite: null,
      })
      Date.now = originalNow
      expect(await verifyOAuthState(aged)).toBeNull()
    } finally {
      Date.now = originalNow
    }
  })

  it('rejects tokens dated more than 30초 in the future (clock-skew guard)', async () => {
    const originalNow = Date.now
    try {
      const realNow = originalNow.call(Date)
      Date.now = () => realNow + 5 * 60 * 1000
      const futureToken = await signOAuthState({
        originHost: 'x',
        returnTo: '/',
        invite: null,
      })
      Date.now = originalNow
      expect(await verifyOAuthState(futureToken)).toBeNull()
    } finally {
      Date.now = originalNow
    }
  })

  it('issues a fresh nonce per call (replay/uniqueness)', async () => {
    const seen = new Set<string>()
    for (let i = 0; i < 32; i++) {
      const token = await signOAuthState({
        originHost: 'x',
        returnTo: '/',
        invite: null,
      })
      const parsed = await verifyOAuthState(token)
      expect(parsed).not.toBeNull()
      seen.add(parsed!.nonce)
    }
    expect(seen.size).toBe(32)
  })
})

describe('AGM Battles connect intent', () => {
  it('round-trips an authorized guild prefill for up to 24 hours', async () => {
    const token = await signAgmBattlesConnectIntent({
      server: 'europe',
      guildAlbionId: 'guild_ABC-123',
      sourcePath: '/zvz-battles/guild/europe/guild_ABC-123',
    })

    await expect(verifyAgmBattlesConnectIntent(token)).resolves.toMatchObject({
      server: 'europe',
      guildAlbionId: 'guild_ABC-123',
      sourcePath: '/zvz-battles/guild/europe/guild_ABC-123',
      issuedAt: expect.any(Number),
      expiresAt: expect.any(Number),
    })
  })

  it('rejects tampering, expired intents, and paths outside AGM Battles', async () => {
    const token = await signAgmBattlesConnectIntent({
      server: 'west',
      guildAlbionId: 'guild-1',
      sourcePath: '/zvz-battles/guild/west/guild-1',
    })
    const [payload, signature] = token.split('.')
    await expect(
      verifyAgmBattlesConnectIntent(`${payload.slice(0, -1)}A.${signature}`),
    ).resolves.toBeNull()

    const now = Date.now()
    const invalidTokens = await Promise.all([
      signTestPayload({
        server: 'west',
        guildAlbionId: 'guild-1',
        sourcePath: '/admin/dashboard',
        issuedAt: now,
        expiresAt: now + 60_000,
      }),
      signTestPayload({
        server: 'west',
        guildAlbionId: 'guild-1',
        sourcePath: '/zvz-battles/guild/west/guild-1',
        issuedAt: now - 86_400_001,
        expiresAt: now - 1,
      }),
      signTestPayload({
        server: 'west',
        guildAlbionId: 'x'.repeat(129),
        sourcePath: '/zvz-battles/guild/west/oversized',
        issuedAt: now,
        expiresAt: now + 60_000,
      }),
    ])

    for (const invalidToken of invalidTokens) {
      await expect(verifyAgmBattlesConnectIntent(invalidToken)).resolves.toBeNull()
    }
  })
})

describe('bot install state', () => {
  it('round-trips the guided guild binding and open-install intent', async () => {
    const guided = await signBotInstallState({
      expectedGuildId: '123456789012345678',
      mode: 'guided',
      originHost: 'menhera.albion-guildmanager.com',
    })
    const open = await signBotInstallState({
      expectedGuildId: null,
      mode: 'open',
    })

    await expect(verifyBotInstallState(guided)).resolves.toMatchObject({
      expectedGuildId: '123456789012345678',
      mode: 'guided',
      originHost: 'menhera.albion-guildmanager.com',
      nonce: expect.any(String),
    })
    await expect(verifyBotInstallState(open)).resolves.toMatchObject({
      expectedGuildId: null,
      mode: 'open',
      originHost: null,
      nonce: expect.any(String),
    })
  })

  it('recovers an independent browser-bound bot intent when Discord omits state', async () => {
    const guided = await signBotInstallState({
      expectedGuildId: '123456789012345678',
      mode: 'guided',
      nonce: 'guided-flow',
    })
    const open = await signBotInstallState({
      expectedGuildId: null,
      mode: 'open',
      nonce: 'open-flow',
    })

    const guidedResult = await resolveBotInstallIntent([guided, open], {
      guildId: '123456789012345678',
    })
    expect(guidedResult).toMatchObject({
      state: {
        nonce: 'guided-flow',
        expectedGuildId: '123456789012345678',
        mode: 'guided',
      },
    })

    const openResult = await resolveBotInstallIntent(
      [guided, open],
      { guildId: '999999999999999999' },
    )
    expect(openResult).toMatchObject({
      state: {
        nonce: 'open-flow',
        expectedGuildId: null,
        mode: 'open',
      },
    })
  })

  it('requires an exact browser intent when Discord does return state', async () => {
    const browserState = await signBotInstallState({
      expectedGuildId: '123456789012345678',
      mode: 'guided',
    })
    const foreignState = await signBotInstallState({
      expectedGuildId: '123456789012345678',
      mode: 'guided',
    })

    await expect(resolveBotInstallIntent([browserState], {
      returnedState: foreignState,
      guildId: '123456789012345678',
    })).resolves.toBeNull()
  })
})

describe('signHopToken / verifyHopToken', () => {
  it('round-trips with session + returnTo + preferredLocale', async () => {
    const token = await signHopToken({
      session: SAMPLE_SESSION,
      returnTo: '/me',
      preferredLocale: 'ko',
      requiresBrowserBinding: true,
    })
    const parsed = await verifyHopToken(token)
    expect(parsed).not.toBeNull()
    expect(parsed?.session.discordId).toBe(SAMPLE_SESSION.discordId)
    expect(parsed?.session.username).toBe(SAMPLE_SESSION.username)
    expect(parsed?.returnTo).toBe('/me')
    expect(parsed?.preferredLocale).toBe('ko')
    expect(parsed?.requiresBrowserBinding).toBe(true)
  })

  it('defaults preferredLocale to null when not supplied', async () => {
    const token = await signHopToken({
      session: SAMPLE_SESSION,
      returnTo: '/',
      requiresBrowserBinding: false,
    })
    const parsed = await verifyHopToken(token)
    expect(parsed?.preferredLocale).toBeNull()
  })

  it('rejects hop tokens older than HOP_TOKEN_MAX_AGE_SECONDS (60초)', async () => {
    const originalNow = Date.now
    try {
      const realNow = originalNow.call(Date)
      Date.now = () => realNow - 61 * 1000
      const aged = await signHopToken({
        session: SAMPLE_SESSION,
        returnTo: '/',
        requiresBrowserBinding: true,
      })
      Date.now = originalNow
      expect(await verifyHopToken(aged)).toBeNull()
    } finally {
      Date.now = originalNow
    }
  })

  it('rejects tampered hop tokens', async () => {
    const token = await signHopToken({
      session: SAMPLE_SESSION,
      returnTo: '/',
      requiresBrowserBinding: true,
    })
    const [payloadB64, sigB64] = token.split('.')
    const fakeSig = 'A'.repeat(sigB64.length)
    expect(await verifyHopToken(`${payloadB64}.${fakeSig}`)).toBeNull()
  })

  it('rejects malformed hop tokens', async () => {
    expect(await verifyHopToken(undefined)).toBeNull()
    expect(await verifyHopToken('')).toBeNull()
    expect(await verifyHopToken('garbage')).toBeNull()
  })

  it('cross-domain replay: OAuth state token does NOT verify as a hop token', async () => {
    // 같은 서명 형식이라도 payload shape 이 다르므로 hop 으로는 통과하면 안 된다.
    const stateToken = await signOAuthState({
      originHost: 'x',
      returnTo: '/',
      invite: null,
    })
    expect(await verifyHopToken(stateToken)).toBeNull()
  })

  it('cross-domain replay: hop token does NOT verify as an OAuth state', async () => {
    const hop = await signHopToken({
      session: SAMPLE_SESSION,
      returnTo: '/',
      requiresBrowserBinding: true,
    })
    expect(await verifyOAuthState(hop)).toBeNull()
  })

  it('rejects hop tokens whose browser-binding policy is missing', async () => {
    const legacyShape = await signTestPayload({
      session: SAMPLE_SESSION,
      returnTo: '/',
      preferredLocale: null,
      flowId: 'legacy-flow',
      issuedAt: Date.now(),
    })

    expect(await verifyHopToken(legacyShape)).toBeNull()
  })
})
