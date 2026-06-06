'use client'

import dynamic from 'next/dynamic'
import type { NoticeTarget } from '@/app/actions/notice-image'
import type { AppSettingKey } from '@/lib/app-settings'
import type { LogOperatingStartDomain } from '@/lib/log-operating-start'
import type { NoticeImageSize } from '@/lib/notice-image-size'
import type { InventoryRow } from '@/components/ShopInventoryEditor'

type AodpPriceMode = 'spot' | 'avg_1d' | 'avg_3d' | 'avg_7d' | 'avg_14d'
type AodpQuality = 1 | 2 | 3 | 4 | 5

interface AodpSettingsFormProps {
  initialCities: string[]
  initialMode: AodpPriceMode
  initialMinQuality: AodpQuality
}

interface LogOperatingStartSettingsFormProps {
  initialShopChestStartAt: string
  initialSiphonStartAt: string
  timezone: string
  domains?: readonly LogOperatingStartDomain[]
  embedded?: boolean
}

interface NoticeSettingFormProps {
  settingKey: AppSettingKey
  target?: NoticeTarget
  imageSizeSettingKey?: AppSettingKey
  initialMessage: string
  initialImageUrl?: string
  initialImageSize?: NoticeImageSize
  title: string
  description: string
  label: string
  placeholder: string
  clearLabel: string
  clearTooltip: string
  tooLongMessage: string
  embedded?: boolean
}

interface ShopBlacklistEditorProps {
  initial: string[]
}

interface LastShopChestLog {
  importedAt: string
  loggedAt: string
  player: string
  itemNameRaw: string
  quantity: number
}

interface ShopImportFormProps {
  lastImportAt: string | null
  lastChestLog: LastShopChestLog | null
  timezone: string
  isImportStale: boolean
}

interface ShopImportTierFilterFormProps {
  initialExcludeAtOrBelow: string
  initialExcludeAtOrAbove: string
}

interface ShopSilverRateFormProps {
  initial: string
}

interface ShopInventoryEditorProps {
  rows: InventoryRow[]
  discountRate: number
  canResetShop: boolean
}

const AodpSettingsForm = dynamic<AodpSettingsFormProps>(() => import('@/components/AodpSettingsForm'))
const LogOperatingStartSettingsForm = dynamic<LogOperatingStartSettingsFormProps>(
  () => import('@/components/LogOperatingStartSettingsForm'),
)
const NoticeSettingForm = dynamic<NoticeSettingFormProps>(
  () => import('@/components/NoticeSettingForm'),
)
const ShopBlacklistEditor = dynamic<ShopBlacklistEditorProps>(
  () => import('@/components/ShopBlacklistEditor'),
)
const ShopImportForm = dynamic<ShopImportFormProps>(() => import('@/components/ShopImportForm'))
const ShopImportTierFilterForm = dynamic<ShopImportTierFilterFormProps>(
  () => import('@/components/ShopImportTierFilterForm'),
)
const ShopInventoryEditor = dynamic<ShopInventoryEditorProps>(
  () => import('@/components/ShopInventoryEditor'),
)
const ShopResetPanel = dynamic(() => import('@/components/ShopResetPanel'))
const ShopSilverRateForm = dynamic<ShopSilverRateFormProps>(
  () => import('@/components/ShopSilverRateForm'),
)

export function AodpSettingsFormLazy(
  props: AodpSettingsFormProps,
) {
  return <AodpSettingsForm {...props} />
}

export function LogOperatingStartSettingsFormLazy(
  props: LogOperatingStartSettingsFormProps,
) {
  return <LogOperatingStartSettingsForm {...props} />
}

export function NoticeSettingFormLazy(
  props: NoticeSettingFormProps,
) {
  return <NoticeSettingForm {...props} />
}

export function ShopBlacklistEditorLazy(
  props: ShopBlacklistEditorProps,
) {
  return <ShopBlacklistEditor {...props} />
}

export function ShopImportFormLazy(
  props: ShopImportFormProps,
) {
  return <ShopImportForm {...props} />
}

export function ShopImportTierFilterFormLazy(
  props: ShopImportTierFilterFormProps,
) {
  return <ShopImportTierFilterForm {...props} />
}

export function ShopInventoryEditorLazy(
  props: ShopInventoryEditorProps,
) {
  return <ShopInventoryEditor {...props} />
}

export function ShopResetPanelLazy() {
  return <ShopResetPanel />
}

export function ShopSilverRateFormLazy(
  props: ShopSilverRateFormProps,
) {
  return <ShopSilverRateForm {...props} />
}
