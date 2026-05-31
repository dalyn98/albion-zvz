import { describe, expect, it } from 'vitest'
import {
  ADMIN_NOTIFICATION_TOPICS,
  parseAdminNotificationTopics,
} from './admin-notification-topics'

describe('admin notification topics', () => {
  it('falls back to all topics when the setting is empty or malformed', () => {
    expect(parseAdminNotificationTopics('')).toEqual([...ADMIN_NOTIFICATION_TOPICS])
    expect(parseAdminNotificationTopics('not json')).toEqual([...ADMIN_NOTIFICATION_TOPICS])
  })

  it('keeps only known topics and removes duplicates', () => {
    expect(parseAdminNotificationTopics('["regear","unknown","shop","regear"]')).toEqual([
      'regear',
      'shop',
    ])
  })
})
