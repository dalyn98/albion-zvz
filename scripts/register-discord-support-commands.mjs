#!/usr/bin/env node
// Registers only the official support command in the one allow-listed guild.
// This deliberately does not touch the global /agm command tree.

import COMMANDS from '../src/lib/discord-support-command-catalog.mjs'

const DISCORD_API = 'https://discord.com/api/v10'

async function main() {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const clientId = process.env.DISCORD_CLIENT_ID
  const supportGuildId = process.env.DISCORD_SUPPORT_GUILD_ID
  if (!botToken) throw new Error('DISCORD_BOT_TOKEN is required')
  if (!clientId) throw new Error('DISCORD_CLIENT_ID is required')
  if (!/^\d{5,30}$/.test(supportGuildId ?? '')) {
    throw new Error('DISCORD_SUPPORT_GUILD_ID is required')
  }

  const url = `${DISCORD_API}/applications/${clientId}/guilds/${supportGuildId}/commands`
  const res = await fetch(url, {
    // POST is an upsert by command name. Do not bulk-overwrite unrelated
    // guild-scoped commands that may already exist in the support server.
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMANDS[0]),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Discord support command registration failed (${res.status}): ${body}`)
  const registered = JSON.parse(body)
  if (registered?.name !== 'support') {
    throw new Error('Discord returned an unexpected support command tree')
  }
  console.log(`[register-support] registered /support in guild ${supportGuildId}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
