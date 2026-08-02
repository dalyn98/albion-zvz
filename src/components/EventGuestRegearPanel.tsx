import { ShieldCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type {
  MyRegearRequest,
  RegearEligibleEvent,
  RegearLimits,
} from '@/app/actions/regear'
import RegearRequestButton from '@/components/RegearRequestButton'
import RegearRequestCancelButton from '@/components/RegearRequestCancelButton'
import { formatSilver } from '@/lib/silver'
import { translateSlotRole } from '@/lib/slot-role-i18n'

export interface EventGuestRegearView {
  enabled: boolean
  supportEnabled: boolean
  eligibleEvent: RegearEligibleEvent | null
  requests: MyRegearRequest[]
  limits: RegearLimits
  craftEnabled: boolean
  craftIncludeCapeDefault: boolean
  timezone: string
}

export default async function EventGuestRegearPanel({
  view,
}: {
  view: EventGuestRegearView
}) {
  const [t, tStatus, tRole] = await Promise.all([
    getTranslations('eventGuestRegear'),
    getTranslations('status'),
    getTranslations('slotRole'),
  ])
  const latestRequest = view.requests[0] ?? null
  const event = view.eligibleEvent

  return (
    <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900/70 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-amber-300" />
        <div>
          <h2 className="font-bold text-white">{t('title')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-gray-400">
            {t('description')}
          </p>
        </div>
      </div>

      {!view.supportEnabled || !view.enabled ? (
        <p className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2 text-xs text-gray-500">
          {t('disabled')}
        </p>
      ) : latestRequest ? (
        <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-950/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-gray-200">
              {t('requestStatus')}
            </span>
            <span className="rounded-full border border-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-300">
              {tStatus(latestRequest.status)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            <span>
              {t('role')}{' '}
              <strong className="text-gray-200">
                {translateSlotRole(latestRequest.role_name, tRole)}
              </strong>
            </span>
            <span>
              {t('claim')}{' '}
              <strong className="font-mono text-amber-300">
                {formatSilver(latestRequest.claimed_silver ?? 0)}
              </strong>
            </span>
          </div>
          {latestRequest.status === 'pending' && (
            <RegearRequestCancelButton id={latestRequest.id} />
          )}
        </div>
      ) : event ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
          <div className="text-xs text-gray-400">
            <p>
              {t('role')}{' '}
              <strong className="text-gray-200">
                {translateSlotRole(event.role_name, tRole)}
              </strong>
            </p>
            <p className="mt-1">
              {t('ceiling')}{' '}
              <strong className="font-mono text-amber-300">
                {formatSilver(event.role_reward)}
              </strong>
            </p>
          </div>
          <RegearRequestButton
            eventId={event.id}
            roleName={event.role_name}
            roleReward={event.role_reward}
            rolePolicyEnabled={event.role_policy_enabled}
            rolePolicyMatchStatus={event.role_policy_match_status}
            rolePolicyDiscordRoleName={event.role_policy_discord_role_name}
            rolePolicySilverCap={event.role_policy_silver_cap}
            eventRegearDisabled={event.regear_policy === 'disabled'}
            existingActiveCount={event.existing_active_count}
            maxDeaths={event.max_deaths_per_member}
            payoutRatePercent={event.role_payout_rate_percent ?? 100}
            overchargePayoutRatePercent={100}
            videoPayoutRatePercent={event.video_payout_rate_percent}
            videoClaimCeilingBonusSilver={
              event.video_claim_ceiling_bonus_silver
            }
            videoRateAppliesWithoutProof={
              event.video_rate_applies_without_proof
            }
            windowOpenAt={event.window_open_at}
            windowMinutes={view.limits.windowMinutes}
            craftEnabled={view.craftEnabled}
            craftIncludeCapeDefault={view.craftIncludeCapeDefault}
            overchargeEnabled={false}
            allianceContentOption={null}
            allianceContentSourceBattleIds={[]}
            timezone={view.timezone}
          />
        </div>
      ) : (
        <p className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2 text-xs leading-relaxed text-gray-500">
          {t('waitingForConfirmation')}
        </p>
      )}
    </section>
  )
}
