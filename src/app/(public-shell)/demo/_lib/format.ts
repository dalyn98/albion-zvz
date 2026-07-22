import type { DemoTimeLabel, DemoRelativeDay } from '@/data/demo-seed'

export type DemoTranslator = (key: string, values?: Record<string, string | number>) => string

export function formatDayLabel(t: DemoTranslator, day: DemoRelativeDay): string {
  return t(`day.${day}` as `day.${DemoRelativeDay}`)
}

export function formatTimeLabel(t: DemoTranslator, time: DemoTimeLabel): string {
  return `${formatDayLabel(t, time.day)} ${time.time}`
}

export function formatRelativeHoursLabel(t: DemoTranslator, count: number): string {
  return t('relativeTime.hoursAgo', { count })
}

export function formatSilver(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return n.toLocaleString()
}

export function formatSilverFull(n: number): string {
  return n.toLocaleString()
}
