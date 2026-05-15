// Discord Interactions endpoint — 슬래시 커맨드를 받는다.
//
// Discord 가 모든 인터랙션을 우리 서버로 POST 하고, 각 요청에는 Ed25519
// 서명이 헤더로 붙는다. 검증 실패 시 401 을 응답해야 Discord 가 endpoint 를
// 살아 있다고 판정 — 검증 파트 실패는 그 자체로 보안 이슈가 아니라 endpoint
// 등록 실패의 신호다.
//
// 또한 Discord 는 등록 검증 단계와 주기적 health check 로 type=1 (PING)
// 인터랙션을 보낸다. 그때는 type=1 (PONG) 으로 응답해야 한다.
//
// 표준 참고: https://discord.com/developers/docs/interactions/receiving-and-responding

import { NextResponse } from 'next/server'
import {
  verifyDiscordSignature,
  INTERACTION_TYPE_PING,
  INTERACTION_TYPE_APPLICATION_COMMAND,
  INTERACTION_RESPONSE_TYPE_PONG,
  type DiscordInteractionPayload,
} from '@/lib/discord-interactions'
import { handleSlashCommand } from '@/lib/discord-commands'
import { log } from '@/lib/log'

// Discord 는 3 초 안에 응답이 오지 않으면 endpoint 가 죽었다고 판단해
// 사용자에게 "interaction failed" 를 띄운다. DB 쿼리 1-2 회면 충분히 안에
// 들어오지만 안전하게 동적으로 실행되도록 force-dynamic.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  if (!publicKey) {
    log.error('[discord/interactions] DISCORD_PUBLIC_KEY is not configured')
    return new NextResponse('Server misconfigured', { status: 500 })
  }

  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')
  if (!signature || !timestamp) {
    return new NextResponse('Bad signature', { status: 401 })
  }

  const rawBody = await request.text()
  const ok = verifyDiscordSignature({
    publicKeyHex: publicKey,
    signatureHex: signature,
    timestamp,
    rawBody,
  })
  if (!ok) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  let payload: DiscordInteractionPayload
  try {
    payload = JSON.parse(rawBody) as DiscordInteractionPayload
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  // PING (type 1) 은 endpoint 검증 + health check. PONG 만 돌려주면 된다.
  if (payload.type === INTERACTION_TYPE_PING) {
    return NextResponse.json({ type: INTERACTION_RESPONSE_TYPE_PONG })
  }

  if (payload.type !== INTERACTION_TYPE_APPLICATION_COMMAND) {
    // 미지원 인터랙션 타입 (버튼, 모달 등) — 우리는 슬래시 커맨드만 처리.
    // 그래도 200 + 빈 ephemeral 응답을 돌려야 사용자 화면에 에러가 안 뜬다.
    return NextResponse.json({ type: 4, data: { content: '·', flags: 1 << 6 } })
  }

  try {
    const response = await handleSlashCommand(payload)
    return NextResponse.json(response)
  } catch (error) {
    // 핸들러 실패는 운영자만 알면 되고, 사용자에게는 ephemeral 안내. Discord
    // 가 본문 길이 제한이 있어 메시지를 짧게 — 자세한 디버깅은 서버 로그에서.
    log.error('[discord/interactions] handler failed', error, {
      interaction_type: payload.type,
      guild_id: payload.guild_id,
    })
    return NextResponse.json({
      type: 4,
      data: {
        content: 'Something went wrong. Please try again later.',
        flags: 1 << 6,
      },
    })
  }
}
