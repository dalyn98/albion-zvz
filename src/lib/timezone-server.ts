// Server-only timezone helpers. Split from `@/lib/timezone` because the async
// `getTenantTimezone` here pulls in `app-settings.ts` (and transitively
// `super-admin-impersonation.ts` which uses `next/headers`). Keeping it out of
// the shared module lets client components import the pure utilities (display
// formatters, validation, presets) from `@/lib/timezone` without dragging
// server-only code into the browser bundle.
//
// Use this module from RSC pages, server actions, and route handlers.

import 'server-only'

import { getAppSetting } from '@/lib/app-settings'
import { DEFAULT_TENANT_TIMEZONE, isValidTenantTimezone } from '@/lib/timezone'

// Fetches the configured timezone for a tenant from app_settings. Falls back
// to DEFAULT_TENANT_TIMEZONE when unset (existing menhera tenant silently
// inherits Asia/Seoul, preserving current behavior).
export async function getTenantTimezone(guildId?: string): Promise<string> {
  const value = await getAppSetting('tenant_timezone', DEFAULT_TENANT_TIMEZONE, guildId)
  return isValidTenantTimezone(value) ? value : DEFAULT_TENANT_TIMEZONE
}
