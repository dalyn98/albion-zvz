import { describe, expect, it } from 'vitest'
import { buildDiscordDmActionRows } from './discord-dm'

describe('Discord DM action buttons', () => {
  it('builds safe Discord link buttons and resolves internal paths', () => {
    expect(buildDiscordDmActionRows([
      { label: ' 이벤트 ', url: '/events/event-1' },
      { label: '설정', url: 'https://guild.example/me/settings#discord-dm' },
    ], 'https://guild.example')).toEqual([{
      type: 1,
      components: [
        { type: 2, style: 5, label: '이벤트', url: 'https://guild.example/events/event-1' },
        {
          type: 2,
          style: 5,
          label: '설정',
          url: 'https://guild.example/me/settings#discord-dm',
        },
      ],
    }])
  })

  it('drops unsafe URLs and enforces Discord button limits', () => {
    const actions = [
      { label: 'unsafe', url: 'javascript:alert(1)' },
      ...Array.from({ length: 6 }, (_, index) => ({
        label: `button-${index}`,
        url: `/path-${index}`,
      })),
    ]

    const rows = buildDiscordDmActionRows(actions, 'https://guild.example')
    expect(rows[0]?.components).toHaveLength(5)
    expect(rows[0]?.components.every((button) => button.url.startsWith('https://'))).toBe(true)
  })
})
