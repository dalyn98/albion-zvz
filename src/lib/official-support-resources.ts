import type { DiscordChannelPayload } from '@/lib/discord'

export const OFFICIAL_SUPPORT_RESOURCES_VERSION = 'premium-support-hub-v2'

export const OFFICIAL_SUPPORT_RESOURCE_KEYS = [
  'start-here',
  'announcements',
  'service-status',
  'product-guide',
  'changelog',
  'known-issues',
  'feedback',
  'before-you-open',
  'open-a-ticket',
] as const

export const LEGACY_SUPPORT_RESOURCE_KEYS = [
  'quick-start',
  'faq',
  'security-and-privacy',
  'bot-installation',
  'bot-permissions',
  'commands-guide',
  'battle-data-help',
  'regear-and-shop',
  'billing-and-plans',
] as const

export type OfficialSupportResourceKey = (typeof OFFICIAL_SUPPORT_RESOURCE_KEYS)[number]
export type OfficialSupportResourceChannelIds = Record<OfficialSupportResourceKey, string>

export interface OfficialSupportForumTag {
  name: string
  emojiName: string
  moderated?: boolean
}

export interface OfficialSupportResourceSpec {
  key: OfficialSupportResourceKey
  name: string
  category: 'welcome' | 'product' | 'support'
  type: 0 | 5 | 15
  aliases?: string[]
  messageAliases?: string[]
  access: 'read-only' | 'feedback' | 'ticket'
  topic: string
  forumTags?: readonly OfficialSupportForumTag[]
}

export const OFFICIAL_SUPPORT_RESOURCE_SPECS: readonly OfficialSupportResourceSpec[] = [
  {
    key: 'start-here', name: '👋・start-here', aliases: ['start-here', 'welcome-and-rules'],
    category: 'welcome', type: 0, access: 'read-only',
    topic: 'Official product links, support scope, safety guidance, and the fastest path to help.',
  },
  {
    key: 'announcements', name: '📣・announcements', aliases: ['announcements'],
    category: 'welcome', type: 5, access: 'read-only',
    topic: 'Major Albion Guild Manager product, maintenance, and support-policy announcements.',
  },
  {
    key: 'service-status', name: '🟢・service-status', aliases: ['service-status'],
    category: 'welcome', type: 0, access: 'read-only',
    topic: 'Human-authored incident, mitigation, recovery, and service-health updates.',
  },
  {
    key: 'product-guide', name: '🧭・product-guide', aliases: ['product-features'],
    messageAliases: ['product-features'], category: 'product', type: 0, access: 'read-only',
    topic: 'One curated guide for setup, bot permissions, commands, battles, regear, shop, and billing.',
  },
  {
    key: 'changelog', name: '📝・changelog', aliases: ['changelog'],
    category: 'product', type: 0, access: 'read-only',
    topic: 'Notable product releases and official support-server improvements.',
  },
  {
    key: 'known-issues', name: '🐛・known-issues', aliases: ['known-issues'],
    category: 'product', type: 15, access: 'read-only',
    topic: 'Staff-confirmed product issues. Search by status before opening a support ticket.',
    forumTags: [
      { name: 'Investigating', emojiName: '🔎' },
      { name: 'Identified', emojiName: '🛠️' },
      { name: 'Monitoring', emojiName: '👀' },
      { name: 'Resolved', emojiName: '✅' },
    ],
  },
  {
    key: 'feedback', name: '💡・feedback', category: 'product', type: 15, access: 'feedback',
    topic: 'Structured product feedback and feature requests. Support requests belong in private tickets.',
    forumTags: [
      { name: 'Feature Request', emojiName: '✨' },
      { name: 'Improvement', emojiName: '🧭' },
      { name: 'Documentation', emojiName: '📚' },
      { name: 'Integration', emojiName: '🔌' },
    ],
  },
  {
    key: 'before-you-open', name: '📌・before-you-open', aliases: ['before-opening-a-ticket'],
    messageAliases: ['before-opening-a-ticket'], category: 'support', type: 0, access: 'read-only',
    topic: 'Prepare safe diagnostic details before creating one private support ticket.',
  },
  {
    key: 'open-a-ticket', name: '🎫・open-a-ticket', aliases: ['create-a-ticket'],
    messageAliases: ['create-a-ticket'], category: 'support', type: 0, access: 'ticket',
    topic: 'Create one private human-support ticket without sharing credentials or payment details.',
  },
] as const

const site = (path: string) => `https://albion-guildmanager.com${path}`
const GOLD = 0xd6a84b
const GREEN = 0x43b581
const BLUE = 0x5865f2

function linkRow(buttons: Array<{ label: string; url: string }>): NonNullable<DiscordChannelPayload['components']>[number] {
  return {
    type: 1,
    components: buttons.map((button) => ({ type: 2, style: 5, label: button.label, url: button.url })),
  }
}

function brandedPayload(input: {
  title: string
  description: string
  color?: number
  buttons?: Array<{ label: string; url: string }>
}): DiscordChannelPayload {
  return {
    embeds: [{
      title: input.title,
      description: input.description,
      color: input.color ?? GOLD,
      footer: { text: 'Albion Guild Manager · Official Support' },
    }],
    ...(input.buttons?.length ? { components: [linkRow(input.buttons)] } : {}),
    allowed_mentions: { parse: [] },
  }
}

export function buildOfficialSupportResourcePayloads(
  channelIds: OfficialSupportResourceChannelIds,
): Partial<Record<OfficialSupportResourceKey, DiscordChannelPayload>> {
  const channel = (key: OfficialSupportResourceKey) => `<#${channelIds[key]}>`
  return {
    'start-here': brandedPayload({
      title: 'Welcome to Albion Guild Manager',
      description: [
        '**Command your guild with clarity.** Plan ZvZ events, manage builds and members, review battles, process regear, and operate your guild economy from one connected workspace.',
        `**New here?** Open ${channel('product-guide')} for the complete setup and feature map.`,
        `**Need assistance?** Check ${channel('service-status')} and ${channel('known-issues')}, then review ${channel('before-you-open')} before creating one private ticket.`,
        '**Support boundary**\nHuman staff provide support in English. AI may privately classify or summarize a ticket for staff, but never answers users or makes account, billing, moderation, or enforcement decisions.',
        '**Stay safe**\nNever share passwords, recovery codes, card details, API keys, session tokens, OAuth secrets, or Discord bot tokens.',
      ].join('\n\n'),
      buttons: [
        { label: 'Open Dashboard', url: site('/login') },
        { label: 'Invite Bot', url: site('/invite') },
        { label: 'Documentation', url: site('/docs') },
        { label: 'View Features', url: site('/features') },
      ],
    }),
    announcements: brandedPayload({
      title: 'Official Announcements',
      description: `Major product, maintenance, documentation, and support-policy announcements are published here. Operational incidents belong in ${channel('service-status')}; confirmed defects belong in ${channel('known-issues')}.`,
      color: BLUE,
      buttons: [{ label: 'Product Website', url: site('/') }],
    }),
    'service-status': brandedPayload({
      title: 'All Systems Operational',
      description: `No active staff-confirmed incident is posted at this time. During an incident, this channel records the affected area, current state, available workaround, and recovery confirmation. Also review ${channel('known-issues')}.`,
      color: GREEN,
    }),
    'product-guide': brandedPayload({
      title: 'Product Guide',
      description: [
        '**01 · GET STARTED**\nSign in with Discord, invite the official bot to a guild you manage, complete the setup wizard, link your Albion character, and publish your first event.',
        '**02 · BOT & COMMANDS**\nThe bot does **not** need Administrator. Keep its role above roles it manages and allow only the channel, message, thread, command, and optional nickname permissions required for enabled features. Use `/agm` in your own guild; complex administration continues on the signed-in dashboard.',
        '**03 · ZVZ OPERATIONS**\nCreate events, publish rosters, manage build sheets and slots, support guests, and review attendance. Battle and killboard data can arrive late from upstream sources; prepare a public battle ID and UTC time when reporting missing data.',
        '**04 · REGEAR & ECONOMY**\nAutomatic regear creates pending claims for supported Black Zone deaths. Claimants can review equipment and edit per-slot prices before staff approval. Shop rate 100% means silver and points are 1:1; 50% means half the point price.',
        '**05 · BILLING & SECURITY**\nUse a private Billing ticket for account-specific help. Provide a transaction reference and redacted evidence only—never full card data, credentials, tokens, or recovery codes.',
      ].join('\n\n'),
      buttons: [
        { label: 'Setup Guide', url: site('/docs/onboarding/setup-wizard') },
        { label: 'Command Guide', url: site('/docs/discord/commands') },
        { label: 'Regear Guide', url: site('/docs/regear') },
        { label: 'Pricing', url: site('/pricing') },
      ],
    }),
    changelog: brandedPayload({
      title: 'Product Changelog',
      description: `Notable product and official support-server changes are summarized here. Smaller fixes may ship without an individual post; active incidents and unresolved defects remain in ${channel('service-status')} and ${channel('known-issues')}.`,
      buttons: [
        { label: 'Feature Overview', url: site('/features') },
        { label: 'Documentation', url: site('/docs') },
      ],
    }),
    'before-you-open': brandedPayload({
      title: 'Before You Open a Ticket',
      description: [
        `**1. Check first** — Review ${channel('service-status')}, ${channel('known-issues')}, and ${channel('product-guide')}.`,
        '**2. Prepare context** — Add a short subject, expected result, actual result, UTC time, guild name, and safe reproduction steps.',
        '**3. Use public identifiers** — For battle issues, include the public battle ID or Albion record URL. For billing, use only a transaction reference and redact screenshots.',
        '**4. Remove secrets** — Never submit passwords, recovery codes, full card details, API keys, session tokens, OAuth secrets, or bot tokens.',
        `**5. Create once** — Use ${channel('open-a-ticket')} and continue in the private thread. Support hours: Monday-Friday, 01:00-10:00 UTC.`,
      ].join('\n\n'),
    }),
    'open-a-ticket': brandedPayload({
      title: 'Private Human Support',
      description: 'Use the ticket panel below or `/support` to create one private ticket. Choose the closest category and provide only the information needed to identify or reproduce the issue. Human staff answer tickets; AI remains staff-only and advisory.',
      color: BLUE,
    }),
  }
}

export const OFFICIAL_SUPPORT_FEEDBACK_GUIDE = [
  '**How to submit useful product feedback**',
  'Choose the closest forum tag and describe the problem or opportunity—not only a proposed solution.',
  '**Include:** who benefits, the current workflow, the expected improvement, and a concrete example.',
  '**Do not include:** account-specific support requests, exploits, credentials, payment details, private guild data, or duplicate requests.',
  'Feedback is reviewed by humans. Posting does not guarantee implementation or a reply. For an active problem, use a private support ticket instead.',
].join('\n\n')

export const OFFICIAL_SUPPORT_KNOWN_ISSUES_STATUS = [
  '**No staff-confirmed known issues are currently listed.**',
  'When an issue is confirmed, staff will publish a post with its affected area, status, safe workaround, and resolution update.',
  'If you are experiencing a problem, check service status and search this forum before opening one private support ticket.',
].join('\n\n')
