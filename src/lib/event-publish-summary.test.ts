import { describe, expect, it } from 'vitest'
import { summarizeEventPublishState } from './event-publish-summary'

describe('event publish summary', () => {
  it('summarizes the freshly persisted slot and notification state', () => {
    expect(summarizeEventPublishState({
      slots: [
        { isHidden: false, assignedDiscordId: 'member-1' },
        { isHidden: false, assignedDiscordId: null },
        { isHidden: true, assignedDiscordId: 'member-2' },
      ],
      tentativeCount: 4,
      eventNotificationChannelId: null,
      tenantNotificationChannelId: 'channel-1',
    })).toEqual({
      visibleSlots: 2,
      hiddenSlots: 1,
      assignedSlots: 2,
      emptySlots: 1,
      tentativeCount: 4,
      hasNotificationChannel: true,
    })
  })
})
