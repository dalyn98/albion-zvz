export interface FirstRunDiscordField {
  name: string
  value: string
  inline?: boolean
}

export interface FirstRunDiscordPayload {
  content?: string
  embeds?: Array<{
    title: string
    description: string
    color: number
    fields: FirstRunDiscordField[]
    footer: { text: string }
    timestamp: string
  }>
  allowed_mentions: { parse: [] }
}

export interface FirstRunTestAnnouncementLabels {
  content: string
  title: string
  description: string
  inviteField: string
  eventsField: string
  guideField: string
  footer: string
}

export interface BuildFirstRunTestAnnouncementInput {
  guildName: string
  inviteUrl: string
  eventsUrl: string
  guideUrl: string
  labels: FirstRunTestAnnouncementLabels
}

export function buildFirstRunTestAnnouncementPayload(
  input: BuildFirstRunTestAnnouncementInput,
): FirstRunDiscordPayload {
  return {
    content: input.labels.content,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: input.labels.title,
        description: input.labels.description,
        color: 0x5865f2,
        fields: [
          { name: input.labels.inviteField, value: input.inviteUrl, inline: false },
          { name: input.labels.eventsField, value: input.eventsUrl, inline: true },
          { name: input.labels.guideField, value: input.guideUrl, inline: true },
        ],
        footer: { text: input.labels.footer },
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

export interface ConsumeFirstRunRateLimitInput {
  key: string
  nowMs: number
  windowMs: number
}

export type ConsumeFirstRunRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export function consumeFirstRunAnnouncementRateLimit(
  store: Map<string, number>,
  input: ConsumeFirstRunRateLimitInput,
): ConsumeFirstRunRateLimitResult {
  const previous = store.get(input.key)
  if (previous !== undefined) {
    const elapsed = input.nowMs - previous
    if (elapsed >= 0 && elapsed < input.windowMs) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((input.windowMs - elapsed) / 1000),
      }
    }
  }

  store.set(input.key, input.nowMs)
  return { allowed: true }
}
