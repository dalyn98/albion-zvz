import { describe, expect, it } from 'vitest'
import {
  CAP,
  CAPABILITY_PRESETS,
  getCapabilityPresetBits,
  serializeCapabilities,
} from './permissions'
import {
  canAccessAdminPath,
  canAccessAnyOfficerAdminRoute,
  getFirstAccessibleAdminPath,
} from './admin-route-access'

describe('admin route access', () => {
  it('legacy admins can access every admin dashboard route', () => {
    expect(canAccessAdminPath('/admin/dashboard', true, '0')).toBe(true)
    expect(canAccessAdminPath('/admin/dashboard/settings', true, '0')).toBe(true)
  })

  it('non-admins cannot access routes without an explicit officer capability rule', () => {
    const caps = serializeCapabilities(CAP.SIPHON_MANAGE)
    expect(canAccessAdminPath('/admin/dashboard', false, caps)).toBe(false)
    expect(canAccessAdminPath('/admin/dashboard/regear', false, caps)).toBe(false)
    expect(canAccessAdminPath('/admin/dashboard/backup', false, caps)).toBe(false)
  })

  it('allows a matching officer capability for its route and nested paths', () => {
    const caps = serializeCapabilities(CAP.SIPHON_MANAGE)
    expect(canAccessAdminPath('/admin/dashboard/siphon', false, caps)).toBe(true)
    expect(canAccessAdminPath('/admin/dashboard/siphon/import', false, caps)).toBe(true)
  })

  it('allows finance capabilities into stats routes', () => {
    expect(canAccessAdminPath(
      '/admin/dashboard/stats',
      false,
      serializeCapabilities(CAP.STATS_VIEW),
    )).toBe(true)
    expect(canAccessAdminPath(
      '/admin/dashboard/settlements',
      false,
      serializeCapabilities(CAP.SETTLEMENT_MANAGE),
    )).toBe(false)
  })

  it('allows delegated operation capabilities into matching admin areas', () => {
    expect(canAccessAdminPath(
      '/admin/dashboard/approvals?tab=shop',
      false,
      serializeCapabilities(CAP.INVENTORY_DELIVER),
    )).toBe(true)
    expect(canAccessAdminPath(
      '/admin/dashboard/shop',
      false,
      serializeCapabilities(CAP.SHOP_PRICING),
    )).toBe(true)
    expect(canAccessAdminPath(
      '/admin/dashboard/shop',
      false,
      serializeCapabilities(CAP.CHEST_LOG_PASTE),
    )).toBe(true)
    expect(canAccessAdminPath(
      '/admin/dashboard/loot-audit',
      false,
      serializeCapabilities(CAP.CHEST_LOG_PASTE),
    )).toBe(true)
    expect(canAccessAdminPath(
      '/admin/dashboard/craft',
      false,
      serializeCapabilities(CAP.CRAFT_TASK_DELIVER),
    )).toBe(true)
    expect(canAccessAdminPath(
      '/admin/dashboard/regear-windows',
      false,
      serializeCapabilities(CAP.REGEAR_APPROVE),
    )).toBe(true)
    expect(canAccessAdminPath(
      '/admin/dashboard/settings',
      false,
      serializeCapabilities(CAP.SETTINGS_GUILD_PROFILE),
    )).toBe(true)
    expect(canAccessAdminPath(
      '/admin/dashboard/settings',
      false,
      serializeCapabilities(CAP.SIPHON_MANAGE),
    )).toBe(true)
  })

  it('keeps log operations preset aligned with log routes', () => {
    const logOfficer = CAPABILITY_PRESETS.find((preset) => preset.key === 'logOfficer')
    expect(logOfficer).toBeDefined()
    const caps = serializeCapabilities(getCapabilityPresetBits(logOfficer?.capabilities ?? []))

    expect(canAccessAdminPath('/admin/dashboard/siphon', false, caps)).toBe(true)
    expect(canAccessAdminPath('/admin/dashboard/loot-audit', false, caps)).toBe(true)
    expect(canAccessAdminPath('/admin/dashboard/audit', false, caps)).toBe(true)
    expect(canAccessAdminPath('/admin/dashboard/permissions', false, caps)).toBe(false)
  })

  it('keeps delegated permission officers on the permissions page', () => {
    const caps = serializeCapabilities(CAP.SETTINGS_PERMISSIONS)
    expect(canAccessAdminPath('/admin/dashboard/permissions', false, caps)).toBe(true)
    expect(canAccessAdminPath('/admin/dashboard/settings', false, caps)).toBe(true)
    expect(getFirstAccessibleAdminPath(false, caps)).toBe('/admin/dashboard/permissions')
  })

  it('does not allow a different officer capability into another protected route', () => {
    const caps = serializeCapabilities(CAP.SIPHON_MANAGE)
    expect(canAccessAdminPath('/admin/dashboard/audit', false, caps)).toBe(false)
    expect(canAccessAdminPath('/admin/dashboard/permissions', false, caps)).toBe(false)
  })

  it('shows officer admin navigation when at least one officer route is available', () => {
    expect(canAccessAnyOfficerAdminRoute(false, serializeCapabilities(CAP.AUDIT_VIEW))).toBe(true)
    expect(canAccessAnyOfficerAdminRoute(false, '0')).toBe(false)
  })

  it('redirects officers to their first accessible admin route instead of the admin-only root', () => {
    expect(getFirstAccessibleAdminPath(true, '0')).toBe('/admin/dashboard')
    expect(getFirstAccessibleAdminPath(false, serializeCapabilities(CAP.STATS_VIEW))).toBe('/admin/dashboard/stats')
    expect(getFirstAccessibleAdminPath(false, '0')).toBe(null)
  })
})
