import { getTranslations } from 'next-intl/server'
import { listRegearWindows } from '@/app/actions/regear-windows'
import AccessDeniedState from '@/components/AccessDeniedState'
import RegearWindowsAdmin from '@/components/RegearWindowsAdmin'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { REGEAR_WINDOW_MANAGE_CAPS } from '@/lib/regear-window-permissions'
import { getRegearSupportConfiguration } from '@/lib/regear-support-server'

// 이벤트와 무관한 자유 리기어 신청 창구 관리. 관리자는 윈도우를 열고 (open),
// 마감 시각이 오거나 직접 닫을 (close) 수 있으며, 멤버는 열려 있는 윈도우에
// /regear 페이지에서 신청한다. 승인 흐름은 기존 /approvals 와 동일.
export const dynamic = 'force-dynamic'

export default async function RegearWindowsPage() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if (!sessionHasAny(session, REGEAR_WINDOW_MANAGE_CAPS)) return <AccessDeniedState />
  const guildId = await getSessionGuildId(session)
  const [{ windows, error }, t, tRegear, tenantTimezone, support] = await Promise.all([
    listRegearWindows('all'),
    getTranslations('adminRegearWindows'),
    getTranslations('regear'),
    getTenantTimezone(guildId),
    getRegearSupportConfiguration(guildId),
  ])
  const readOnly = support.state !== 'supported'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('pageTitle')}</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('pageDescription')}</p>
      </div>
      {readOnly && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-200">{tRegear('supportDisabledTitle')}</p>
          <p className="mt-1 text-xs text-amber-100/80">
            {tRegear('supportDisabledDescription')}
          </p>
        </div>
      )}
      {error ? (
        <div className="rounded-lg bg-red-900/30 border border-red-700/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : (
        <RegearWindowsAdmin
          initialWindows={windows}
          tenantTimezone={tenantTimezone}
          readOnly={readOnly}
        />
      )}
    </div>
  )
}
