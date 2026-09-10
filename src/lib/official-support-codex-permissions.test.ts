import { describe, expect, it } from 'vitest'
import { buildPrivateCodexOwnerPermissions } from '@/lib/official-support-server'
import { SUPPORT_CODEX_OPERATOR_DISCORD_ID } from '@/lib/support-codex-control-core'

const bit = (position: bigint) => 1n << position

describe('official support Codex channel permissions', () => {
  it('denies everyone and grants access only to the exact owner member and bot', () => {
    const guildId = '893456789012345678'
    const botId = '893456789012345679'
    const overwrites = buildPrivateCodexOwnerPermissions(
      guildId,
      botId,
      SUPPORT_CODEX_OPERATOR_DISCORD_ID,
    )

    expect(overwrites.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: guildId, type: 0 },
      { id: SUPPORT_CODEX_OPERATOR_DISCORD_ID, type: 1 },
      { id: botId, type: 1 },
    ])
    expect(BigInt(overwrites[0].deny) & bit(10n)).toBe(bit(10n))
    expect(BigInt(overwrites[1].allow) & bit(10n)).toBe(bit(10n))
  })
})
