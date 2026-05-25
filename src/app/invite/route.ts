import { NextResponse } from 'next/server'
import { buildOpenBotInstallUrl } from '@/lib/discord'

export async function GET() {
  return NextResponse.redirect(
    buildOpenBotInstallUrl({ state: crypto.randomUUID() }),
  )
}
