import { describe, expect, it } from 'vitest'
import {
  isTenantOnboardingEventType,
  summarizeTenantOnboardingEvents,
} from './tenant-onboarding-events'

describe('tenant onboarding events', () => {
  it('accepts only known onboarding event types', () => {
    expect(isTenantOnboardingEventType('bot_installed')).toBe(true)
    expect(isTenantOnboardingEventType('first_event_notification_sent')).toBe(true)
    expect(isTenantOnboardingEventType('event.delete')).toBe(false)
    expect(isTenantOnboardingEventType(null)).toBe(false)
  })

  it('summarizes progress and prioritizes the next admin action', () => {
    const summary = summarizeTenantOnboardingEvents({
      tenant: {
        id: 'tenant-1',
        status: 'active',
        botInstalled: true,
        eventChannelId: 'channel-1',
      },
      events: [
        { eventType: 'bot_installed', createdAt: '2026-06-01T00:00:00.000Z' },
        {
          eventType: 'setup_step_saved',
          createdAt: '2026-06-01T00:05:00.000Z',
          details: { step: 'discord' },
        },
        { eventType: 'setup_completed', createdAt: '2026-06-01T00:10:00.000Z' },
        { eventType: 'admin_dashboard_viewed', createdAt: '2026-06-01T00:15:00.000Z' },
        { eventType: 'first_event_created', createdAt: '2026-06-01T00:20:00.000Z' },
      ],
    })

    expect(summary.latestEventAt).toBe('2026-06-01T00:20:00.000Z')
    expect(summary.completed).toMatchObject({
      botInstalled: true,
      setupCompleted: true,
      adminDashboardViewed: true,
      memberInviteCopied: false,
      testAnnouncementSent: false,
      firstEventCreated: true,
      firstEventPublished: false,
      firstEventNotificationSent: false,
    })
    expect(summary.completedStepCount).toBe(4)
    expect(summary.totalStepCount).toBe(8)
    expect(summary.nextAction.key).toBe('copy_member_invite')
  })

  it('diagnoses tenants that finished setup without a Discord event channel', () => {
    const summary = summarizeTenantOnboardingEvents({
      tenant: {
        id: 'tenant-1',
        status: 'active',
        botInstalled: true,
        eventChannelId: null,
      },
      events: [
        { eventType: 'bot_installed', createdAt: '2026-06-01T00:00:00.000Z' },
        { eventType: 'setup_completed', createdAt: '2026-06-01T00:10:00.000Z' },
      ],
    })

    expect(summary.nextAction.key).toBe('configure_discord_channel')
    expect(summary.diagnoses).toContainEqual(
      expect.objectContaining({
        key: 'event_channel_missing',
        severity: 'warning',
      }),
    )
  })

  it('diagnoses bot-installed tenants stuck before setup completion', () => {
    const summary = summarizeTenantOnboardingEvents({
      tenant: {
        id: 'tenant-1',
        status: 'pending',
        botInstalled: true,
        eventChannelId: null,
      },
      events: [
        { eventType: 'bot_installed', createdAt: '2026-06-01T00:00:00.000Z' },
      ],
    })

    expect(summary.nextAction.key).toBe('open_setup_wizard')
    expect(summary.diagnoses).toContainEqual(
      expect.objectContaining({
        key: 'setup_incomplete',
        severity: 'critical',
      }),
    )
  })
})
