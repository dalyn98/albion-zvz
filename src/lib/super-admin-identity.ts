// Cookie-free platform-operator identity helpers. Keep this module safe for
// Proxy imports: request/render helpers live in `super-admin.ts`.

function loadSuperAdminIds(): Set<string> {
  const raw = process.env.SUPER_ADMIN_DISCORD_IDS ?? ''
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  )
}

export function isSuperAdmin(discordId: string | null | undefined): boolean {
  if (!discordId) return false
  return loadSuperAdminIds().has(discordId)
}
