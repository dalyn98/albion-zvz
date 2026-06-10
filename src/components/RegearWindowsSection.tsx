import { Inbox, Clock } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  listRegearWindows,
  listRegearRoleOptions,
} from '@/app/actions/regear-windows'
import { getRegearPayoutRateConfig } from '@/app/actions/regear-admin-types'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getAppSetting } from '@/lib/app-settings'
import { formatDateTime } from '@/lib/format-datetime'
import RegearWindowSubmitButton from './RegearWindowSubmitButton'

// /regear 페이지에 열려 있는 윈도우들을 카드 리스트로 노출. 멤버는 카드의
// "신청" 버튼으로 모달을 열어 역할/스크린샷/청구 silver 를 입력해 제출한다.
export default async function RegearWindowsSection() {
  const session = await getSession()
  if (!session) return null
  const guildId = await getSessionGuildId(session)

  const [
    { windows },
    { options },
    payoutRateConfig,
    t,
    tenantTimezone,
    craftEnabledRaw,
    craftIncludeCapeRaw,
    overchargeEnabledRaw,
  ] = await Promise.all([
    listRegearWindows('open'),
    listRegearRoleOptions(),
    getRegearPayoutRateConfig(),
    getTranslations('regearWindow'),
    getTenantTimezone(guildId),
    getAppSetting('craft_regear_enabled', 'false', guildId),
    getAppSetting('craft_regear_include_cape', 'false', guildId),
    getAppSetting('regear_overcharge_enabled', 'false', guildId),
  ])
  const craftEnabled = craftEnabledRaw === 'true'
  const craftIncludeCapeDefault = craftIncludeCapeRaw === 'true'
  const overchargeEnabled = overchargeEnabledRaw === 'true'

  if (windows.length === 0) return null

  // 같은 윈도우에 대한 본인의 non-rejected death 신청 수 — 카드에서 "X/Y회" 표시 +
  // 데스 한도 도달 시 버튼의 death 선택 비활성화에 쓴다. 오버차지는 제외.
  const db = getAdminClient()
  const { data: existingRows } = await db
    .from('regear_requests')
    .select('regear_window_id, request_type')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .neq('status', 'rejected')
    .not('regear_window_id', 'is', null)
  const countMap = new Map<string, number>()
  for (const row of existingRows ?? []) {
    if ((row.request_type ?? 'death') !== 'death') continue
    const wid = row.regear_window_id as string
    countMap.set(wid, (countMap.get(wid) ?? 0) + 1)
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Inbox size={16} className="text-amber-400" />
        <h2 className="text-base font-bold text-white">{t('sectionTitle')}</h2>
        <span className="text-xs text-gray-500">({windows.length})</span>
      </div>
      <p className="text-xs text-gray-500">{t('sectionHint')}</p>
      <ul className="space-y-3">
        {windows.map((w) => {
          const existingActive = countMap.get(w.id) ?? 0
          return (
            <li
              key={w.id}
              className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-bold text-white truncate">{w.title}</h3>
                  {w.description && (
                    <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap">{w.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span>{t('metaLimit', { max: w.maxDeathsPerMember })}</span>
                    {w.closesAt && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />
                        {t('metaClosesAt', { ts: formatDateTime(w.closesAt, tenantTimezone) })}
                      </span>
                    )}
                    {existingActive > 0 && (
                      <span className="text-amber-300">
                        {t('metaSubmittedCount', {
                          count: existingActive,
                          max: w.maxDeathsPerMember,
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <RegearWindowSubmitButton
                  window={w}
                  roleOptions={options}
                  payoutRatePercent={payoutRateConfig.baseRatePercent}
                  videoPayoutRatePercent={payoutRateConfig.videoRatePercent}
                  existingActiveCount={existingActive}
                  craftEnabled={craftEnabled}
                  craftIncludeCapeDefault={craftIncludeCapeDefault}
                  overchargeEnabled={overchargeEnabled}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
