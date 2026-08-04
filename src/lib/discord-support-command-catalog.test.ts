import { describe, expect, it } from 'vitest'
import supportCommands from './discord-support-command-catalog.mjs'

describe('Discord support command catalog', () => {
  it('registers one guild-scoped support tree without altering /agm', () => {
    expect(supportCommands).toHaveLength(1)
    expect(supportCommands[0].name).toBe('support')
    expect(supportCommands[0].options?.map((option: { name: string }) => option.name)).toEqual([
      'setup', 'panel', 'sync', 'health', 'priority', 'known-issue', 'reopen',
    ])
  })

  it('keeps the official support command surface English-only', () => {
    expect(JSON.stringify(supportCommands)).not.toContain('_localizations')
  })
})
