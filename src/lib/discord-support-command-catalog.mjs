const input = (name, description, type, config = {}) => ({
  name,
  description,
  type,
  ...config,
})

const channelInput = (name, description, required = false) =>
  input(name, description, 7, { required })

const subcommand = (name, description, options = []) => ({
  name,
  description,
  type: 1,
  ...(options.length > 0 ? { options } : {}),
})

const discordSupportCommandCatalog = [
  {
    name: 'support',
    description: 'Official support ticket operations',
    type: 1,
    options: [
      subcommand('setup', 'Configure the official support ticket hub', [
        channelInput('parent', 'Ticket hub text channel', true),
        channelInput('log', 'Private staff audit log channel', true),
        input('staff-role', 'Support staff role', 8, { required: true }),
        channelInput('queue', 'Private support queue channel'),
        channelInput('ai-review', 'Private staff-only AI review channel'),
        channelInput('security-alert', 'Private security alert channel'),
        channelInput('status', 'Public service status channel'),
        channelInput('known-issues', 'Public known issues forum channel'),
      ]),
      subcommand('panel', 'Publish or repair the ticket panel'),
      subcommand('sync', 'Synchronize the support configuration and panel'),
      subcommand('health', 'Run staff-only support configuration diagnostics'),
      subcommand('priority', 'Set a ticket priority after staff review', [
        input('ticket', 'Ticket number, for example T-000123', 3, {
          required: true,
          min_length: 1,
          max_length: 20,
        }),
        input('level', 'Human-confirmed priority', 3, {
          required: true,
          choices: [
            { name: 'Normal', value: 'normal' },
            { name: 'High', value: 'high' },
            { name: 'Urgent', value: 'urgent' },
          ],
        }),
      ]),
      subcommand('known-issue', 'Link a ticket to a human-authored known issue', [
        input('ticket', 'Ticket number, for example T-000123', 3, {
          required: true,
          min_length: 1,
          max_length: 20,
        }),
        input('slug', 'Exact known-issue slug', 3, {
          required: true,
          min_length: 1,
          max_length: 120,
        }),
      ]),
      subcommand('reopen', 'Reopen a closed ticket', [
        input('ticket', 'Ticket number, for example T-000123', 3, {
          required: true,
          min_length: 1,
          max_length: 20,
        }),
      ]),
    ],
  },
]

export default discordSupportCommandCatalog
