import { getRegearVideoProofStats } from '@/app/actions/stats-admin'
import {
  REGEAR_VIDEO_PROOF_WINDOW_OPTIONS,
  type RegearVideoProofWindow,
} from '@/lib/regear-video-proof-stats'
import RegearVideoProofPanel, {
  type RegearVideoProofPanelLabels,
} from './RegearVideoProofPanel'
import type { StatsTranslator } from './shared'

function windowLabelKey(window: RegearVideoProofWindow): Parameters<StatsTranslator>[0] {
  switch (window) {
    case '7':
      return 'regearVideoProofWindow7'
    case '30':
      return 'regearVideoProofWindow30'
    case '90':
      return 'regearVideoProofWindow90'
    case 'all':
      return 'regearVideoProofWindowAll'
  }
}

function buildPanelLabels(tStats: StatsTranslator): RegearVideoProofPanelLabels {
  return {
    loadError: tStats('regearVideoProofLoadError'),
    unknownError: tStats('unknownError'),
    title: tStats('regearVideoProofTitle', { window: '{window}' }),
    description: tStats('regearVideoProofDescription'),
    windowFilter: tStats('regearVideoProofWindowFilter'),
    windowLabels: Object.fromEntries(
      REGEAR_VIDEO_PROOF_WINDOW_OPTIONS.map((window) => [
        window,
        tStats(windowLabelKey(window)),
      ]),
    ) as Record<RegearVideoProofWindow, string>,
    membersLabel: tStats('regearVideoProofMembersLabel'),
    membersHint: tStats('regearVideoProofMembersHint', { requests: '{requests}' }),
    attachedLabel: tStats('regearVideoProofAttachedLabel'),
    attachedHint: tStats('regearVideoProofAttachedHint', { rate: '{rate}' }),
    averageLabel: tStats('regearVideoProofAverageLabel'),
    averageHint: tStats('regearVideoProofAverageHint'),
    latestLabel: tStats('regearVideoProofLatestLabel'),
    latestHint: tStats('regearVideoProofLatestHint'),
    noLatest: tStats('regearVideoProofNoLatest'),
    membersTitle: tStats('regearVideoProofMembersTitle'),
    membersSubtitle: tStats('regearVideoProofMembersSubtitle', { count: '{count}' }),
    membersEmpty: tStats('regearVideoProofMembersEmpty'),
    memberRate: tStats('regearVideoProofMemberRate', { rate: '{rate}' }),
    requestUnit: tStats('regearVideoProofRequestUnit', { count: '{count}' }),
    videoUnit: tStats('regearVideoProofVideoUnit', { count: '{count}' }),
    lastVideoAt: tStats('regearVideoProofLastVideoAt', { date: '{date}' }),
  }
}

export default async function RegearVideoProofSection({
  tStats,
}: {
  tStats: StatsTranslator
}) {
  const { stats, error } = await getRegearVideoProofStats()
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        {tStats('regearVideoProofLoadError')}: {error ?? tStats('unknownError')}
      </section>
    )
  }

  return <RegearVideoProofPanel initialStats={stats} labels={buildPanelLabels(tStats)} />
}
