import type { ReactNode } from 'react'
import type { AppSettingKey } from '@/lib/app-settings'
import type { GalleryItem } from '@/lib/guild-profile-gallery-config'
import {
  BannerEditControlClient,
  EditableFieldClient,
  GalleryEditControlClient,
  HiddenSectionsControlClient,
  SectionVisibilityControlClient,
  type HiddenSectionEntry,
  type EditorOption,
} from '@/components/guild/GuildProfileEditControlsClient'
import type { EditorKind } from '@/components/guild/InlineEditableField'

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

export function EditableField({
  enabled,
  children,
  ...props
}: EditableFieldProps) {
  if (!enabled) return <>{children}</>
  return (
    <EditableFieldClient enabled={enabled} {...props}>
      {children}
    </EditableFieldClient>
  )
}

export function BannerEditControl({
  enabled,
  currentUrl,
  currentOpacity,
}: {
  enabled: boolean
  currentUrl: string
  currentOpacity: number
}) {
  if (!enabled) return null
  return (
    <BannerEditControlClient
      enabled={enabled}
      currentUrl={currentUrl}
      currentOpacity={currentOpacity}
    />
  )
}

export function SectionVisibilityControl({
  enabled,
  settingKey,
  size,
}: {
  enabled: boolean
  settingKey: AppSettingKey
  size?: 'sm' | 'md'
}) {
  if (!enabled) return null
  return (
    <SectionVisibilityControlClient
      enabled={enabled}
      settingKey={settingKey}
      size={size}
    />
  )
}

export function GalleryEditControl({
  enabled,
  items,
}: {
  enabled: boolean
  items: GalleryItem[]
}) {
  if (!enabled) return null
  return <GalleryEditControlClient enabled={enabled} items={items} />
}

export function HiddenSectionsControl({
  enabled,
  hiddenSections,
}: {
  enabled: boolean
  hiddenSections: HiddenSectionEntry[]
}) {
  if (!enabled || hiddenSections.length === 0) return null
  return (
    <HiddenSectionsControlClient
      enabled={enabled}
      hiddenSections={hiddenSections}
    />
  )
}
