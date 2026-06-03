#!/usr/bin/env node
// Discord 슬래시 커맨드 등록 스크립트 (글로벌).
//
// 일회성 + 변경 시점에만 돌린다. Discord 의 글로벌 커맨드는 PUT 하나로
// 전체 목록을 덮어쓰므로 (idempotent) 매번 같은 결과가 나온다.
//
// 사용:
//   node --env-file=.env.local scripts/register-discord-commands.mjs
//
// 필요한 env:
//   DISCORD_BOT_TOKEN    — 봇 토큰 (이미 사용 중)
//   DISCORD_CLIENT_ID    — 애플리케이션 ID (= 봇의 application_id)
//
// 글로벌 커맨드는 등록 후 디스코드 클라이언트에 노출되기까지 최대 1 시간
// 걸린다. 빠르게 테스트하려면 DEV_GUILD_ID 를 함께 넣어 길드 한정으로
// 등록하면 즉시 반영된다.

const DISCORD_API = 'https://discord.com/api/v10'

const COMMANDS = [
  {
    name: 'agm',
    description: 'Open AlbionGuildManager screens',
    type: 1,
    options: [
      {
        name: 'home',
        description: 'Open your guild home',
        type: 1,
      },
      {
        name: 'me',
        description: 'Open your member dashboard',
        type: 1,
      },
      {
        name: 'verify',
        description: 'Refresh Discord membership and open Albion verification',
        type: 1,
      },
      {
        name: 'events',
        description: 'Open guild events',
        type: 1,
      },
      {
        name: 'regear',
        description: 'Open regear',
        type: 1,
      },
      {
        name: 'shop',
        description: 'Open guild shop',
        type: 1,
      },
      {
        name: 'craft',
        description: 'Open crafting queue',
        type: 1,
      },
      {
        name: 'wallet',
        description: 'Open your wallet',
        type: 1,
      },
      {
        name: 'admin',
        description: 'Open the admin dashboard (site admins only)',
        type: 1,
      },
      {
        name: 'guide',
        description: 'Open member guides',
        type: 1,
      },
      {
        name: 'killbot',
        description: 'Open killbot guide and settings (site admins only)',
        type: 1,
      },
    ],
  },
]

async function main() {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const clientId = process.env.DISCORD_CLIENT_ID
  const devGuildId = process.env.DEV_GUILD_ID
  if (!botToken) throw new Error('DISCORD_BOT_TOKEN is required')
  if (!clientId) throw new Error('DISCORD_CLIENT_ID is required')

  const url = devGuildId
    ? `${DISCORD_API}/applications/${clientId}/guilds/${devGuildId}/commands`
    : `${DISCORD_API}/applications/${clientId}/commands`

  console.log(`[register] PUT ${url}`)
  console.log(`[register] commands: ${COMMANDS.map((c) => '/' + c.name).join(', ')}`)

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMANDS),
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`[register] failed (${res.status}):`, text)
    process.exit(1)
  }

  const registered = JSON.parse(text)
  console.log(`[register] registered ${registered.length} commands:`)
  for (const cmd of registered) {
    console.log(`  - /${cmd.name} (id=${cmd.id})`)
  }
  if (!devGuildId) {
    console.log('[register] global commands take up to 1 hour to propagate.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
