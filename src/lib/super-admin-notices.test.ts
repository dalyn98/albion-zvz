import { describe, expect, it } from 'vitest'
import {
  retainUnexpiredSingleSystemNotice,
  type SystemNotice,
} from '@/lib/super-admin-notices'

function notice(id: string, expiresAt: string): SystemNotice {
  return {
    id,
    message: id,
    imageUrl: null,
    expiresAt,
    purpose: 'maintenance',
    severity: 'important',
    createdAt: '2026-08-02T00:00:00.000Z',
    createdByDiscordId: 'operator',
    archivedAt: null,
  }
}

describe('system notice cache boundary', () => {
  it('drops a cached notice immediately after its expiry and returns at most one', () => {
    const now = Date.parse('2026-08-02T01:00:00.000Z')
    const expired = notice('expired', '2026-08-02T00:59:59.999Z')
    const first = notice('first', '2026-08-02T02:00:00.000Z')
    const second = notice('second', '2026-08-02T03:00:00.000Z')

    expect(retainUnexpiredSingleSystemNotice([expired], now)).toEqual([])
    expect(retainUnexpiredSingleSystemNotice([first, second], now)).toEqual([first])
  })
})
