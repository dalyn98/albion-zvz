import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_FLOW_BINDING_COOKIE_VALUE,
  botInstallIntentCookieName,
  buildCanonicalAuthBindingBridgeUrl,
  canShareAuthBindingCookie,
  getBotInstallIntentCookieValues,
  hasHopTokenBindingCookie,
  hasOAuthStateBindingCookie,
  hopTokenBindingCookieName,
  oauthStateBindingCookieName,
} from './auth-flow-cookie'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildCanonicalAuthBindingBridgeUrl', () => {
  it('bridges preview OAuth through the callback origin before Discord', () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    expect(buildCanonicalAuthBindingBridgeUrl(
      'https://albion-guildmanager-git-fix.vercel.app/api/auth/discord/start',
      { kind: 'user', state: 'SIGNED_STATE', prompt: 'none' },
    )).toBe(
      'https://albion-guildmanager.com/api/auth/discord/bind?kind=user&state=SIGNED_STATE&prompt=none',
    )
  })

  it('does not add a bridge when a parent-domain cookie reaches the callback', () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    expect(buildCanonicalAuthBindingBridgeUrl(
      'https://menhera.albion-guildmanager.com/api/auth/discord/start',
      { kind: 'user', state: 'SIGNED_STATE', prompt: 'consent' },
    )).toBeNull()
  })

  it('bridges a production-domain start when APP_URL uses an unrelated callback host', () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.vercel.app')

    expect(buildCanonicalAuthBindingBridgeUrl(
      'https://menhera.albion-guildmanager.com/api/auth/discord/start',
      { kind: 'user', state: 'SIGNED_STATE', prompt: 'none' },
    )).toBe(
      'https://albion-guildmanager.vercel.app/api/auth/discord/bind?kind=user&state=SIGNED_STATE&prompt=none',
    )
  })

  it('does not add a bridge for same-origin localhost development', () => {
    vi.stubEnv('APP_URL', 'http://localhost:3000')

    expect(buildCanonicalAuthBindingBridgeUrl(
      'http://localhost:3000/api/auth/discord/start',
      { kind: 'bot', state: 'SIGNED_STATE' },
    )).toBeNull()
  })
})

describe('canShareAuthBindingCookie', () => {
  it('shares bindings between the canonical root and tenant subdomains', () => {
    expect(canShareAuthBindingCookie(
      'albion-guildmanager.com',
      'https://menhera.albion-guildmanager.com/api/auth/finish',
    )).toBe(true)
  })

  it('shares host-only bindings on the exact same development host', () => {
    expect(canShareAuthBindingCookie(
      'localhost:3000',
      'http://localhost:3000/api/auth/finish',
    )).toBe(true)
  })

  it('does not claim that a vercel.app callback cookie reaches a custom domain', () => {
    expect(canShareAuthBindingCookie(
      'albion-guildmanager.vercel.app',
      'https://menhera.albion-guildmanager.com/api/auth/finish',
    )).toBe(false)
  })
})

describe('per-flow auth cookie names', () => {
  it('keeps concurrent OAuth, bot install, and hop bindings in independent cookies', () => {
    expect(oauthStateBindingCookieName('flow-a')).toBe('agm_oauth_state_flow-a')
    expect(oauthStateBindingCookieName('flow-b')).toBe('agm_oauth_state_flow-b')
    expect(botInstallIntentCookieName('flow-a')).toBe('agm_bot_install_flow-a')
    expect(hopTokenBindingCookieName('flow-a')).toBe('agm_auth_hop_flow-a')
  })

  it('rejects values that are unsafe in a cookie name', () => {
    expect(() => oauthStateBindingCookieName('bad; path=/')).toThrow()
    expect(() => botInstallIntentCookieName('')).toThrow()
  })

  it('matches only the exact per-flow token and enumerates bot intents', () => {
    const values = new Map([
      ['agm_oauth_state_flow-a', AUTH_FLOW_BINDING_COOKIE_VALUE],
      ['agm_auth_hop_flow-a', AUTH_FLOW_BINDING_COOKIE_VALUE],
      ['agm_bot_install_bot-a', 'BOT_A'],
      ['unrelated', 'IGNORE'],
      ['agm_bot_install_bot-b', 'BOT_B'],
    ])
    const cookies = {
      get: (name: string) => {
        const value = values.get(name)
        return value ? { value } : undefined
      },
      getAll: () => [...values].map(([name, value]) => ({ name, value })),
    }

    expect(hasOAuthStateBindingCookie(cookies, 'flow-a')).toBe(true)
    expect(hasOAuthStateBindingCookie(cookies, 'flow-b')).toBe(false)
    expect(hasHopTokenBindingCookie(cookies, 'flow-a')).toBe(true)
    expect(getBotInstallIntentCookieValues(cookies)).toEqual(['BOT_A', 'BOT_B'])
  })
})
