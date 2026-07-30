import { Box, Clock } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { listMyCraftPickups } from '@/app/actions/craft'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { formatDateTime } from '@/lib/format-datetime'
import { getCraftSlotDisplayEntries } from '@/lib/craft-slot-display'
import ItemImage from './ItemImage'
import MyCraftPickupCollectButton from './MyCraftPickupCollectButton'
import { getRegearSupportConfiguration } from '@/lib/regear-support-server'

// /me 페이지의 "보관함 픽업 대기" 섹션. craft_regear_enabled = true 인 길드에서
// 본인의 status='delivered' 작업만 노출. 회수 후 collected 토글이 끝나면
// 자동으로 사라지고 점유하던 박스 번호가 비워진다.
export default async function MyCraftPickupsSection() {
  const session = await getSession()
  if (!session?.isMember) return null
  const guildId = await getSessionGuildId(session)
  const support = await getRegearSupportConfiguration(guildId)
  const collectEnabled =
    support.supported && support.fulfillmentMode === 'crafted'

  const [{ pickups }, t, tz] = await Promise.all([
    listMyCraftPickups(),
    getTranslations('craftPickup'),
    getTenantTimezone(guildId),
  ])

  if (pickups.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Box size={16} className="text-emerald-400" />
        <h2 className="text-base font-bold text-white">{t('sectionTitle')}</h2>
        <span className="text-xs text-gray-500">({pickups.length})</span>
      </div>
      <p className="text-xs text-gray-500">{t('sectionHint')}</p>
      <ul className="space-y-3">
        {pickups.map((p) => (
          <li
            key={p.taskId}
            className="bg-gray-900 border border-emerald-500/30 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-semibold truncate">{p.eventTitle}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                  <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded px-2 py-0.5 font-mono font-bold">
                    {t('boxLabel', { n: p.boxNumber })}
                  </span>
                  {p.craftCity && <span className="text-gray-500">· {p.craftCity}</span>}
                  {p.crafterUsername && (
                    <span className="text-gray-500">· {t('crafterLine', { name: p.crafterUsername })}</span>
                  )}
                  {p.expiresAt && (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Clock size={11} />
                      {t('expiresAt', { ts: formatDateTime(p.expiresAt, tz) })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {p.buildSnapshot && (
              <div className="flex items-center gap-1.5 flex-wrap border-t border-gray-800 pt-2.5">
                {getCraftSlotDisplayEntries(p.buildSnapshot, p.craftIncludedSlots).map(({ slot, item }) => {
                  return (
                    <ItemImage
                      key={slot}
                      itemId={item.id}
                      itemName={item.name}
                      size={36}
                      hoverPreview
                    />
                  )
                })}
              </div>
            )}
            {collectEnabled && <div className="flex items-center justify-end">
              <MyCraftPickupCollectButton taskId={p.taskId} />
            </div>}
          </li>
        ))}
      </ul>
    </section>
  )
}
