export const OFFICIAL_SUPPORT_RESOURCES_VERSION = 'support-resources-v1'

export const OFFICIAL_SUPPORT_RESOURCE_KEYS = [
  'start-here',
  'quick-start',
  'product-features',
  'faq',
  'security-and-privacy',
  'bot-installation',
  'bot-permissions',
  'commands-guide',
  'battle-data-help',
  'regear-and-shop',
  'billing-and-plans',
  'announcements',
  'changelog',
  'service-status',
  'known-issues',
  'before-opening-a-ticket',
  'create-a-ticket',
] as const

export type OfficialSupportResourceKey = (typeof OFFICIAL_SUPPORT_RESOURCE_KEYS)[number]
export type OfficialSupportResourceChannelIds = Record<OfficialSupportResourceKey, string>

export interface OfficialSupportResourceSpec {
  key: OfficialSupportResourceKey
  name: string
  category: 'start' | 'guides' | 'updates' | 'support'
  type: 0 | 15
  aliases?: string[]
  topic: string
}
export const OFFICIAL_SUPPORT_RESOURCE_SPECS: readonly OfficialSupportResourceSpec[] = [
  { key: 'start-here', name: 'start-here', aliases: ['welcome-and-rules'], category: 'start', type: 0, topic: 'Start here for official links, support scope, response targets, and server rules.' },
  { key: 'quick-start', name: 'quick-start', category: 'start', type: 0, topic: 'Set up Albion Guild Manager for your guild in a few steps.' },
  { key: 'product-features', name: 'product-features', category: 'start', type: 0, topic: 'A practical map of Albion Guild Manager features and documentation.' },
  { key: 'faq', name: 'faq', category: 'start', type: 0, topic: 'Canonical answers maintained by the official support team.' },
  { key: 'security-and-privacy', name: 'security-and-privacy', category: 'start', type: 0, topic: 'Credential safety, privacy, official links, and the staff-only AI boundary.' },
  { key: 'bot-installation', name: 'bot-installation', category: 'guides', type: 0, topic: 'Invite the official bot and complete the setup wizard.' },
  { key: 'bot-permissions', name: 'bot-permissions', category: 'guides', type: 0, topic: 'Minimum Discord permissions and safe troubleshooting guidance.' },
  { key: 'commands-guide', name: 'commands-guide', category: 'guides', type: 0, topic: 'Where to find slash commands and which actions continue on the web.' },
  { key: 'battle-data-help', name: 'battle-data-help', category: 'guides', type: 0, topic: 'Battle and killboard synchronization scope and troubleshooting.' },
  { key: 'regear-and-shop', name: 'regear-and-shop', category: 'guides', type: 0, topic: 'Automatic regear, manual claims, guild shop, points, and exchange rate guidance.' },
  { key: 'billing-and-plans', name: 'billing-and-plans', category: 'guides', type: 0, topic: 'Plans, billing support, and safe payment-related assistance.' },
  { key: 'announcements', name: 'announcements', category: 'updates', type: 0, topic: 'Official product and support announcements.' },
  { key: 'changelog', name: 'changelog', category: 'updates', type: 0, topic: 'Notable product and support-server changes.' },
  { key: 'service-status', name: 'service-status', category: 'updates', type: 0, topic: 'Human-authored incident and recovery updates.' },
  { key: 'known-issues', name: 'known-issues', category: 'updates', type: 15, topic: 'Staff-confirmed known issues and their status.' },
  { key: 'before-opening-a-ticket', name: 'before-opening-a-ticket', category: 'support', type: 0, topic: 'Information to prepare before creating a private support ticket.' },
  { key: 'create-a-ticket', name: 'create-a-ticket', category: 'support', type: 0, topic: 'Create one private support ticket without sharing secrets or payment details.' },
] as const

const site = (path: string) => `https://albion-guildmanager.com${path}`

export function buildOfficialSupportResourceContent(
  channelIds: OfficialSupportResourceChannelIds,
): Record<OfficialSupportResourceKey, string> {
  const channel = (key: OfficialSupportResourceKey) => `<#${channelIds[key]}>`
  return {
    'start-here': [
      '**Welcome to Albion Guild Manager Official Support**',
      'Albion Guild Manager helps guilds operate ZvZ events, battle records, regear, builds, members, inventory, crafting, and a points-based guild shop.',
      `**Start:** [Sign in](${site('/login')}) · [Invite the bot](${site('/invite')}) · [Documentation](${site('/docs')}) · [Features](${site('/features')})`,
      `Read ${channel('quick-start')} for setup, ${channel('service-status')} for incidents, and ${channel('known-issues')} for confirmed product issues. If you still need help, review ${channel('before-opening-a-ticket')} and use ${channel('create-a-ticket')}.`,
      'Support is provided by human staff in English. Be respectful, do not spam, and keep one active ticket at a time.',
    ].join('\n\n'),
    'quick-start': [
      '**Quick start**',
      `1. [Sign in with Discord](${site('/login')}).`,
      `2. [Invite the official bot](${site('/invite')}) to the guild you manage.`,
      `3. Follow the [setup wizard](${site('/docs/onboarding/setup-wizard')}) and choose your operating defaults.`,
      `4. [Link and verify your Albion character](${site('/docs/onboarding/character-link')}).`,
      `5. Create and publish your first ZvZ event using the [event guide](${site('/docs/events/create')}).`,
      `If setup stops, check ${channel('bot-permissions')} before opening a ticket.`,
    ].join('\n'),
    'product-features': [
      '**Product guide**',
      `• **ZvZ operations:** [events](${site('/docs/events')}), build sheets, slots, publishing, guests, and attendance.`,
      `• **Combat data:** [battles](${site('/docs/battles')}) and [killboard](${site('/docs/killboard')}) views.`,
      `• **Guild economy:** [regear](${site('/docs/regear')}), [shop](${site('/docs/shop')}), inventory, crafting, points, and siphon tracking.`,
      `• **People and performance:** [members](${site('/docs/members')}), profiles, achievements, rankings, and weapon statistics.`,
      `Browse the [full feature overview](${site('/features')}) or [complete documentation](${site('/docs')}).`,
    ].join('\n'),
    faq: [
      '**Frequently asked questions**',
      `**Where do I set up a new guild?** Sign in, invite the bot, then complete the [setup wizard](${site('/docs/onboarding/setup-wizard')}).`,
      `**Why is a command missing?** Confirm the bot is installed in that guild, check ${channel('bot-permissions')}, and review ${channel('commands-guide')}.`,
      `**Why is battle data delayed or absent?** Review ${channel('battle-data-help')}; upstream Albion data can be delayed and only supported records are included.`,
      `**How does automatic regear work?** It creates pending claims for supported Black Zone deaths; the claimant can edit per-slot prices before staff approval. See ${channel('regear-and-shop')}.`,
      `**Is AI answering tickets?** No. Human staff reply. AI may privately classify or summarize a ticket for staff only.`,
      `Still blocked? Check ${channel('known-issues')} and then create one private ticket.`,
    ].join('\n\n'),
    'security-and-privacy': [
      '**Security and privacy**',
      'Never share passwords, recovery codes, payment card details, API keys, session tokens, or Discord bot tokens. Official staff will not ask for them.',
      `Use only **albion-guildmanager.com** links. Read the [Privacy Policy](${site('/privacy')}) and [Terms](${site('/terms')}). Report a suspected account or credential incident through a private ticket and rotate exposed credentials immediately.`,
      'AI is staff-only and advisory: it may classify or summarize ticket text, but it never replies to requesters or makes account, billing, moderation, or enforcement decisions.',
    ].join('\n\n'),
    'bot-installation': [
      '**Bot installation**',
      `Use the official [bot invitation](${site('/invite')}) while signed in with the Discord account that manages your guild. Select the correct server, approve the requested permissions, and return to the [setup wizard](${site('/docs/onboarding/setup-wizard')}).`,
      'If the bot already exists in the server, reuse it; do not create a second application or share a bot token.',
      `Detailed steps: [invite and connect a guild](${site('/docs/onboarding/invite')}).`,
    ].join('\n\n'),
    'bot-permissions': [
      '**Bot permissions**',
      'The bot does not need the Discord **Administrator** permission. Keep its managed role above roles it must assign or synchronize, and allow it to view relevant channels, send messages, embed links, read message history, use commands, manage the threads it creates, and manage nicknames only when nickname sync is enabled.',
      'If a slash command is unavailable, confirm the bot role can access that channel and that members can use application commands. If role or nickname actions fail, check role hierarchy first.',
      `Operational guide: [Discord operations](${site('/docs/discord/operations')}). Never paste permission tokens, OAuth secrets, or bot tokens into a ticket.`,
    ].join('\n\n'),
    'commands-guide': [
      '**Commands guide**',
      `Use Albion Guild Manager slash commands inside your own guild. Start typing **/agm** and review the [complete command guide](${site('/docs/discord/commands')}) for current permissions and web handoffs.`,
      'Commands intentionally move complex or sensitive administration to the signed-in dashboard. In this official server, use **/support** or the ticket panel only for support intake.',
    ].join('\n\n'),
    'battle-data-help': [
      '**Battle and killboard help**',
      `Start with the [battle guide](${site('/docs/battles')}) and [killboard synchronization guide](${site('/docs/killboard/sync')}). Albion upstream data can arrive late, and unsupported or low-engagement records may be retained without affecting official results and statistics.`,
      'Before opening a ticket, prepare the battle ID or public Albion record URL, approximate UTC time, guild name, and the result you expected. Do not include private account data or credentials.',
    ].join('\n\n'),
    'regear-and-shop': [
      '**Regear and guild economy**',
      `Automatic regear creates a **pending** claim only for supported Black Zone deaths. The claimant can review the matched equipment and edit per-slot prices before staff approval. See [automatic regear](${site('/docs/regear/auto')}) and [verification](${site('/docs/regear/verification')}).`,
      `For the guild shop, points, inventory, and exchange rate, use the [shop guide](${site('/docs/shop')}). A 100% shop rate means silver and point prices are 1:1; 50% means the item is sold for half the point price.`,
    ].join('\n\n'),
    'billing-and-plans': [
      '**Billing and plans**',
      `Review current product options on the [Pricing page](${site('/pricing')}) and general answers in the [website FAQ](${site('/faq')}).`,
      'For account-specific billing help, open a private **Billing** ticket with your guild name, invoice or transaction reference, charge date, and a redacted screenshot if needed. Never send full card numbers, security codes, passwords, or recovery codes.',
    ].join('\n\n'),
    announcements: [
      '**Official announcements**',
      'Major product, documentation, maintenance, and support-policy announcements are published here by the team. Incident updates belong in the service-status channel and confirmed bugs belong in the known-issues forum.',
    ].join('\n\n'),
    changelog: [
      '**Changelog**',
      `Notable product and support-server changes are summarized here. For the current product surface, use the [Feature overview](${site('/features')}) and [Documentation](${site('/docs')}).`,
      'Smaller fixes may ship without an individual post. Active incidents and unresolved defects are tracked separately.',
    ].join('\n\n'),
    'service-status': [
      '**Service status**',
      `No active staff-confirmed incident is posted at this time. During an incident, staff will post the affected area, current state, workaround when available, and recovery confirmation. Also review ${channel('known-issues')}.`,
    ].join('\n\n'),
    'known-issues': '**Known issues**\nStaff-confirmed product issues are published as forum posts with their current status. Search existing posts before opening a new ticket.',
    'before-opening-a-ticket': [
      '**Before opening a ticket**',
      `1. Check ${channel('faq')}, ${channel('service-status')}, and ${channel('known-issues')}.`,
      '2. Prepare a short subject, what you expected, what happened, UTC time, guild name, and safe reproduction steps.',
      '3. For battle issues, include the public battle ID or record URL. For billing, use only a transaction reference and redact screenshots.',
      '4. Never share passwords, recovery codes, card details, API keys, session tokens, or bot tokens.',
      `5. Use ${channel('create-a-ticket')} once and continue in the private thread. Human staff respond in English during support hours: Monday-Friday, 01:00-10:00 UTC.`,
    ].join('\n'),
    'create-a-ticket': [
      '**Private support tickets**',
      'Use the button below or **/support** to create one private ticket. Choose the closest category and provide only the information needed to reproduce or identify the issue.',
      'Human staff answer tickets. AI may privately classify and summarize the request for staff, but it never sends support answers or makes decisions.',
    ].join('\n\n'),
  }
}
