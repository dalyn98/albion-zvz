export const AUTH_ERROR_KEY_MAP: Record<string, string> = {
  denied: 'denied',
  invalid: 'invalid',
  state_mismatch: 'stateMismatch',
  state_browser_mismatch: 'stateMismatch',
  not_in_guild: 'notInGuild',
  no_identity: 'noIdentity',
  no_role: 'noRole',
  server_error: 'serverError',
  hop_missing: 'hopMissing',
  hop_invalid: 'hopInvalid',
  hop_replayed: 'hopInvalid',
  hop_wrong_host: 'hopWrongHost',
  hop_no_tenant: 'hopNoTenant',
  app_login_invalid: 'appLoginInvalid',
}

export function resolveAuthErrorLabel(
  reason: string | null | undefined,
  labels: Record<string, string>,
): string | null {
  if (!reason) return null
  return labels[AUTH_ERROR_KEY_MAP[reason] ?? 'default'] ?? labels.default ?? null
}
