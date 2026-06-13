import type { NextRequest } from 'next/server'
import { formatKillbotCompactFame, type KillbotBattleSummary } from '@/lib/killbot-battle'
import { renderKillbotBattleSummaryCardPng } from '@/lib/killbot-battle-card'
import {
  loadPublicBattleGroupReport,
  type PublicBattleGroupForceLine,
  type PublicBattleGroupReport,
} from '@/lib/public-battle-report'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const IMAGE_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
const ERROR_CACHE_CONTROL = 'no-store'

function firstQueryValue(request: NextRequest, key: string): string | null {
  const value = request.nextUrl.searchParams.get(key)?.trim()
  return value && value.length > 0 ? value : null
}

function summarizeOpponentNames(forces: ReadonlyArray<PublicBattleGroupForceLine>): string {
  const names = forces.map((force) => force.forceName.trim()).filter(Boolean)
  if (names.length === 0) return 'Multiple forces'
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

function buildBattleDescription(report: PublicBattleGroupReport): string {
  const battleLabel =
    report.requestedBattleIds.length > 1
      ? `Albion battles ${report.requestedBattleIds.join(', ')}`
      : `Battle ${report.requestedBattleIds[0]}`
  const scaleLine = [
    `${report.totalPlayersUnique} players`,
    `${report.forces.length} forces`,
    `Fame ${formatKillbotCompactFame(report.totalFame)}`,
  ].join(' | ')
  return `${battleLabel}\n${scaleLine}`
}

function buildBattleDetailUrl(args: {
  slug: string
  server: string
  ids: string
}): string {
  const query = new URLSearchParams({
    server: args.server,
    ids: args.ids,
  })
  return buildTenantHostUrl(args.slug, `/battles/multi?${query.toString()}`)
}

function buildSummaryFromReport(args: {
  report: PublicBattleGroupReport
  detailUrl: string
}): KillbotBattleSummary {
  const primary = args.report.primaryForce
  const opponents = args.report.forces.filter(
    (force) => force.forceKey !== primary.forceKey,
  )
  return {
    title: `${primary.forceName} ${primary.kills}K / ${primary.deaths}D vs ${summarizeOpponentNames(opponents)}`,
    detailUrl: args.detailUrl,
    description: buildBattleDescription(args.report),
    startedAt: args.report.startedAt,
    homeKills: primary.kills,
    homeDeaths: primary.deaths,
    topKills: [],
    topDeaths: [],
    juicyKills: [],
    forceLines: args.report.forces.slice(0, 4).map((force) => ({
      forceName: force.forceName,
      guildNames: force.guildNames,
      players: force.players,
      kills: force.kills,
      deaths: force.deaths,
      killFame: force.killFame,
    })),
  }
}

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'cache-control': ERROR_CACHE_CONTROL,
      'content-type': 'text/plain; charset=utf-8',
    },
  })
}

export async function GET(request: NextRequest): Promise<Response> {
  const slug = firstQueryValue(request, 'slug')
  const server = firstQueryValue(request, 'server')
  const ids = firstQueryValue(request, 'ids')
  if (!slug || !server || !ids) {
    return textResponse('Missing battle summary image parameters', 400)
  }

  try {
    const result = await loadPublicBattleGroupReport({
      tenantSlug: slug,
      server,
      ids,
    })
    if (!result.ok) {
      return textResponse('Battle summary image not found', 404)
    }

    const detailUrl = buildBattleDetailUrl({
      slug: result.tenant.slug,
      server: result.params.server,
      ids: result.params.canonicalIds,
    })
    const png = await renderKillbotBattleSummaryCardPng(
      buildSummaryFromReport({
        report: result.report,
        detailUrl,
      }),
    )
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        'cache-control': IMAGE_CACHE_CONTROL,
        'content-type': 'image/png',
      },
    })
  } catch {
    return textResponse('Battle summary image unavailable', 500)
  }
}
