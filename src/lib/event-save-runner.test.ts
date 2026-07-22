import { describe, expect, it, vi } from 'vitest'
import { runEventSectionSaves } from './event-save-runner'

describe('runEventSectionSaves', () => {
  it('runs dirty sections in order and stops after the first failure', async () => {
    const calls: string[] = []
    const third = vi.fn(async () => ({ error: undefined }))

    const receipts = await runEventSectionSaves([
      {
        id: 'event-info',
        label: 'Event info',
        save: async () => {
          calls.push('event-info')
          return {}
        },
      },
      {
        id: 'party-1',
        label: 'Party 1',
        save: async () => {
          calls.push('party-1')
          return { error: 'conflict' }
        },
      },
      { id: 'party-2', label: 'Party 2', save: third },
    ])

    expect(calls).toEqual(['event-info', 'party-1'])
    expect(third).not.toHaveBeenCalled()
    expect(receipts).toEqual([
      { id: 'event-info', label: 'Event info', status: 'saved' },
      { id: 'party-1', label: 'Party 1', status: 'failed', error: 'conflict' },
      { id: 'party-2', label: 'Party 2', status: 'skipped' },
    ])
  })

  it('turns thrown errors into a failed receipt', async () => {
    const receipts = await runEventSectionSaves([
      {
        id: 'event-info',
        label: 'Event info',
        save: async () => {
          throw new Error('network down')
        },
      },
    ])

    expect(receipts).toEqual([
      { id: 'event-info', label: 'Event info', status: 'failed', error: 'network down' },
    ])
  })
})
