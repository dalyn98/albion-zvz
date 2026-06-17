'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'
import type { AppSettingKey } from '@/lib/app-settings'
import type { GalleryItem } from '@/lib/guild-profile-gallery-config'
import type { HiddenSectionEntry } from '@/components/guild/HiddenSectionsAdminBar'
import type {
  EditorKind,
  EditorOption,
} from '@/components/guild/InlineEditableField'
import { ToastProvider } from '@/components/ToastProvider'

const InlineEditableField = dynamic(() => import('@/components/guild/InlineEditableField'))
const BannerInlineEdit = dynamic(() => import('@/components/guild/BannerInlineEdit'))
const SectionVisibilityPin = dynamic(() => import('@/components/guild/SectionVisibilityPin'))
const GalleryInlineEdit = dynamic(() => import('@/components/guild/GalleryInlineEdit'))
const HiddenSectionsAdminBar = dynamic(() => import('@/components/guild/HiddenSectionsAdminBar'))

export type { EditorOption, HiddenSectionEntry }

interface EditableFieldProps {
  enabled: boolean
  settingKey: AppSettingKey
  currentValue: string
  kind: EditorKind
  options?: EditorOption[]
  emptyLabel?: string
  label: string
  placeholder?: string
  maxLength?: number
  children: ReactNode
  display?: 'block' | 'inline'
}

export function EditableFieldClient(props: EditableFieldProps) {
  return <InlineEditableField {...props} />
}

export function BannerEditControlClient({
  enabled,
  currentUrl,
  currentOpacity,
}: {
  enabled: boolean
  currentUrl: string
  currentOpacity: number
}) {
  return (
    <BannerInlineEdit
      enabled={enabled}
      currentUrl={currentUrl}
      currentOpacity={currentOpacity}
    />
  )
}

export function SectionVisibilityControlClient({
  enabled,
  settingKey,
  size,
}: {
  enabled: boolean
  settingKey: AppSettingKey
  size?: 'sm' | 'md'
}) {
  return (
    <ToastProvider>
      <SectionVisibilityPin enabled={enabled} settingKey={settingKey} size={size} />
    </ToastProvider>
  )
}

export function GalleryEditControlClient({
  enabled,
  items,
}: {
  enabled: boolean
  items: GalleryItem[]
}) {
  return <GalleryInlineEdit enabled={enabled} items={items} />
}

export function HiddenSectionsControlClient({
  enabled,
  hiddenSections,
}: {
  enabled: boolean
  hiddenSections: HiddenSectionEntry[]
}) {
  return (
    <ToastProvider>
      <HiddenSectionsAdminBar
        enabled={enabled}
        hiddenSections={hiddenSections}
      />
    </ToastProvider>
  )
}
