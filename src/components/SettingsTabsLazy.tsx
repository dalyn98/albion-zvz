'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type SettingsTabsComponent from '@/components/SettingsTabs'

const SettingsTabs = dynamic(() => import('@/components/SettingsTabs'))

export default function SettingsTabsLazy(
  props: ComponentProps<typeof SettingsTabsComponent>,
) {
  return <SettingsTabs {...props} />
}
