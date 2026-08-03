interface DiscordChannelLabelInput {
  name: string
  parentName?: string | null
}

export function formatDiscordChannelLabel({
  name,
  parentName,
}: DiscordChannelLabelInput): string {
  const channel = `#${name}`
  return parentName ? `${parentName} / ${channel}` : channel
}
