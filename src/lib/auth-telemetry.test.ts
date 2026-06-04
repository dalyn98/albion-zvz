import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recordAuthFailure, recordAuthStart, recordAuthSuccess } from './auth-telemetry'

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/log', () => ({
  log: {
    info: mocks.info,
    warn: mocks.warn,
  },
}))

function request(): NextRequest {
  return new NextRequest('https://albion-guildmanager.com/api/auth/discord/callback', {
    headers: {
      host: 'albion-guildmanager.com',
      referer: 'https://guild.example.test/events/event-1?invite=guest-token',
      'user-agent': 'Mozilla/5.0',
    },
  })
}

describe('auth telemetry redaction', () => {
  beforeEach(() => {
    mocks.info.mockReset()
    mocks.warn.mockReset()
  })

  it('redacts sensitive query values from start telemetry context and extras', () => {
    recordAuthStart(request(), 'discord_oauth', {
      return_to: '/events/event-1?invite=guest-token',
      state: 'signed-state',
    })

    expect(mocks.info).toHaveBeenCalledWith(
      '[auth/discord_oauth] start',
      expect.objectContaining({
        referer: 'https://guild.example.test/events/event-1?invite=%5Bredacted%5D',
        return_to: '/events/event-1?invite=%5Bredacted%5D',
        state: '[redacted]',
      }),
    )
  })

  it('redacts nested return URLs in success and failure telemetry', () => {
    recordAuthSuccess(request(), 'callback', {
      return_to: '/welcome-language?return=%2Fevents%2Fevent-1%3Finvite%3Dguest-token',
    })
    recordAuthFailure(request(), 'finish', 'hop_invalid', {
      token: 'hop-token',
    })

    expect(mocks.info).toHaveBeenCalledWith(
      '[auth/callback] success',
      expect.objectContaining({
        return_to: '/welcome-language?return=%2Fevents%2Fevent-1%3Finvite%3D%255Bredacted%255D',
      }),
    )
    expect(mocks.warn).toHaveBeenCalledWith(
      '[auth/finish] failure: hop_invalid',
      expect.objectContaining({
        token: '[redacted]',
      }),
    )
  })
})
