const DISCORD_SNOWFLAKE_PATTERN = /^[0-9]{17,20}$/

interface DiscordRoleDisplayNameInput {
  roleId: string
  liveRoleName?: string | null
  storedRoleName?: string | null
}

/**
 * Discord의 현재 역할 이름을 우선 사용한다. 과거 마이그레이션에서 역할 ID가
 * 이름 스냅샷에 저장된 행은 사용자에게 식별자를 노출하지 않는다.
 */
export function resolveDiscordRoleDisplayName({
  roleId,
  liveRoleName,
  storedRoleName,
}: DiscordRoleDisplayNameInput): string | null {
  const liveName = liveRoleName?.trim()
  if (liveName) return liveName

  const storedName = storedRoleName?.trim()
  if (
    storedName &&
    storedName !== roleId &&
    !DISCORD_SNOWFLAKE_PATTERN.test(storedName)
  ) {
    return storedName
  }

  return null
}
