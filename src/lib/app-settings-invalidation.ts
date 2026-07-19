import { revalidateTag, updateTag } from 'next/cache'
import { appSettingsCacheTag } from '@/lib/app-settings'

// Server Actions use immediate expiry so the following render observes the
// saved tenant setting instead of the previous cross-request cache entry.
export function invalidateAppSettingsCache(guildId: string): void {
  updateTag(appSettingsCacheTag(guildId))
}

// Route handlers/cron work cannot use updateTag. A stale-while-revalidate
// expiry is sufficient for operational timestamps and Discord-side writes.
export function revalidateAppSettingsCache(guildId: string): void {
  revalidateTag(appSettingsCacheTag(guildId), 'max')
}
