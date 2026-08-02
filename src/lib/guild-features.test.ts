import { describe, expect, it } from 'vitest'
import {
  buildGuildFeatureSnapshot,
  createFailClosedGuildFeatureSnapshot,
  isGuildFeatureDiscoverable,
  isGuildFeatureQueueDiscoverable,
  isGuildFeatureUseAllowed,
  isPreservedSupplyHistoryPath,
  resolveGuildFeatureForApplicationCommand,
  resolveGuildFeatureForAdminNotification,
  resolveGuildFeatureForDiscordCommand,
  resolveGuildFeatureForNoticeTarget,
  resolveGuildFeatureForOperationsQueue,
  resolveGuildFeatureForPathname,
  resolveGuildFeatureForSettingKey,
} from './guild-features'

describe('guild feature state contract', () => {
  it('allows only setup while setup is required', () => {
    expect(isGuildFeatureUseAllowed('setup_required', 'setup')).toBe(true)
    expect(isGuildFeatureUseAllowed('setup_required', 'read')).toBe(false)
    expect(isGuildFeatureUseAllowed('setup_required', 'intake')).toBe(false)
  })

  it('drains existing work without admitting intake or automation', () => {
    expect(isGuildFeatureUseAllowed('draining', 'read')).toBe(true)
    expect(isGuildFeatureUseAllowed('draining', 'process')).toBe(true)
    expect(isGuildFeatureUseAllowed('draining', 'notify')).toBe(true)
    expect(isGuildFeatureUseAllowed('draining', 'intake')).toBe(false)
    expect(isGuildFeatureUseAllowed('draining', 'automate')).toBe(false)
    expect(isGuildFeatureDiscoverable('draining')).toBe(true)
  })

  it('fails closed for missing optional rows while keeping core available', () => {
    const snapshot = createFailClosedGuildFeatureSnapshot()
    expect(snapshot.events.state).toBe('enabled')
    expect(snapshot.settings_and_permissions.state).toBe('enabled')
    expect(snapshot.guild_shop.state).toBe('disabled')
  })

  it('ignores invalid rows instead of turning unknown states on', () => {
    const snapshot = buildGuildFeatureSnapshot([
      { feature_key: 'guild_shop', state: 'enabled', config: { version: 1 } },
      { feature_key: 'member_market', state: 'unknown', config: {} },
      { feature_key: 'battlelog', state: 'enabled', config: {} },
    ])
    expect(snapshot.guild_shop).toEqual({
      key: 'guild_shop',
      state: 'enabled',
      config: { version: 1 },
    })
    expect(snapshot.member_market.state).toBe('disabled')
    expect('battlelog' in snapshot).toBe(false)
  })

  it('maps optional routes without claiming battlelog or shared settings', () => {
    expect(resolveGuildFeatureForPathname('/admin/dashboard/shop/recovery')).toBe('guild_shop')
    expect(resolveGuildFeatureForPathname('/tactics/board-id')).toBe('tactics')
    expect(resolveGuildFeatureForPathname('/admin/dashboard/settings')).toBeNull()
    expect(resolveGuildFeatureForPathname('/battles')).toBeNull()
  })

  it('preserves regear history paths after support is disabled', () => {
    expect(resolveGuildFeatureForPathname('/regear')).toBe('supply')
    expect(resolveGuildFeatureForPathname('/me/regear/request-id')).toBe('supply')
    expect(isPreservedSupplyHistoryPath('/regear')).toBe(true)
    expect(isPreservedSupplyHistoryPath('/me/regear/request-id')).toBe(true)
    expect(isPreservedSupplyHistoryPath('/craft/queue')).toBe(false)
  })

  it('maps Discord reads, intake, and draining work to the same catalog', () => {
    expect(resolveGuildFeatureForDiscordCommand('wallet.balance')).toEqual({
      key: 'guild_economy',
      use: 'read',
    })
    expect(resolveGuildFeatureForDiscordCommand('shop.order')).toEqual({
      key: 'guild_shop',
      use: 'intake',
    })
    expect(resolveGuildFeatureForDiscordCommand('craft.deliver')).toEqual({
      key: 'supply',
      use: 'process',
    })
    expect(resolveGuildFeatureForDiscordCommand('stats.battle')).toBeNull()
  })

  it('rechecks delayed Discord confirmations without claiming battle work', () => {
    expect(resolveGuildFeatureForApplicationCommand('point.transfer')).toEqual({
      key: 'guild_economy',
      use: 'intake',
    })
    expect(resolveGuildFeatureForApplicationCommand('craft.deliver')).toEqual({
      key: 'supply',
      use: 'process',
    })
    expect(resolveGuildFeatureForApplicationCommand('event.start')).toBeNull()
  })

  it('routes only feature-owned admin notifications through notify access', () => {
    expect(resolveGuildFeatureForAdminNotification('regear')).toEqual({
      key: 'supply',
      use: 'notify',
    })
    expect(resolveGuildFeatureForAdminNotification('shop')).toEqual({
      key: 'guild_shop',
      use: 'notify',
    })
    expect(resolveGuildFeatureForAdminNotification('members')).toBeNull()
    expect(resolveGuildFeatureForAdminNotification('sync')).toBeNull()
  })

  it('keeps feature-owned settings and page notices inside setup access', () => {
    expect(resolveGuildFeatureForSettingKey('regear_notice_message')).toBe('supply')
    expect(resolveGuildFeatureForSettingKey('shop_delivery_notice')).toBe('guild_shop')
    expect(resolveGuildFeatureForSettingKey('siphon_accounting_mode')).toBe('asset_accounting')
    expect(resolveGuildFeatureForSettingKey('guild_profile_description')).toBe('public_guild_profile')
    expect(resolveGuildFeatureForSettingKey('events_notice_message')).toBeNull()
    expect(resolveGuildFeatureForNoticeTarget('regear')).toBe('supply')
    expect(resolveGuildFeatureForNoticeTarget('shop')).toBe('guild_shop')
    expect(resolveGuildFeatureForNoticeTarget('events')).toBeNull()
  })

  it('maps every shared operator queue to its owning feature', () => {
    expect(resolveGuildFeatureForOperationsQueue('regear')).toBe('supply')
    expect(resolveGuildFeatureForOperationsQueue('craft')).toBe('supply')
    expect(resolveGuildFeatureForOperationsQueue('exchange')).toBe('guild_economy')
    expect(resolveGuildFeatureForOperationsQueue('shop')).toBe('guild_shop')
    expect(resolveGuildFeatureForOperationsQueue('memberTrade')).toBe('member_market')
    expect(resolveGuildFeatureForOperationsQueue('unknown')).toBeNull()
    const snapshot = createFailClosedGuildFeatureSnapshot()
    snapshot.supply.state = 'draining'
    expect(isGuildFeatureQueueDiscoverable(snapshot, 'regear')).toBe(true)
    expect(isGuildFeatureQueueDiscoverable(snapshot, 'shop')).toBe(false)
  })
})
