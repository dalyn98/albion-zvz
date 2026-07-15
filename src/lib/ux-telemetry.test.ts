import { describe, expect, it } from 'vitest'
import {
  parseUxTelemetryPayload,
  UX_TELEMETRY_EVENT_TYPES,
} from './ux-telemetry'

describe('UX telemetry payload', () => {
  it('accepts allowlisted, privacy-safe workflow telemetry', () => {
    expect(parseUxTelemetryPayload({
      eventType: 'approval_filter_change',
      surface: 'admin_approvals',
      flowId: '79f33846-a8be-45fb-9df7-fbfafc6e593c',
      elapsedMs: 1_240,
      metadata: { tab: 'regear', filter: 'manual' },
    })).toEqual({
      eventType: 'approval_filter_change',
      surface: 'admin_approvals',
      flowId: '79f33846-a8be-45fb-9df7-fbfafc6e593c',
      elapsedMs: 1_240,
      metadata: { tab: 'regear', filter: 'manual' },
    })
  })

  it('rejects free text and identity-shaped metadata', () => {
    expect(parseUxTelemetryPayload({
      eventType: 'approval_action',
      surface: 'admin_approvals',
      flowId: '79f33846-a8be-45fb-9df7-fbfafc6e593c',
      metadata: { discordId: '1234567890', notes: 'member private note' },
    })).toBeNull()
  })

  it('keeps the event allowlist intentionally small', () => {
    expect(UX_TELEMETRY_EVENT_TYPES).toEqual([
      'surface_view',
      'approval_filter_change',
      'approval_action',
      'detail_toggle',
      'navigation_action',
    ])
  })
})
