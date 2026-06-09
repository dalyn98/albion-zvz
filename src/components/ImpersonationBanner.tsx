import { Eye } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession, type SessionPayload } from '@/lib/session'
import { isSuperAdminSession } from '@/lib/super-admin'
import { getImpersonationFromCookies } from '@/lib/super-admin-impersonation'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { endImpersonation } from '@/app/super-admin/actions'

// 슈퍼어드민이 임퍼소네이션 모드일 때 모든 페이지 최상단에 빨간 배너로 노출.
// "이 길드 어드민으로 보기" 가 활성화돼 있음을 잊지 않도록 강한 시각 신호.
// 슈퍼어드민이 아니거나 쿠키가 없으면 null.
export default async function ImpersonationBanner({
  session: providedSession,
}: {
  session?: SessionPayload | null
}) {
  const session = providedSession === undefined ? await getSession() : providedSession
  if (!isSuperAdminSession(session)) return null

  const impersonation = await getImpersonationFromCookies()
  if (!impersonation) return null

  const tenant = await getTenantDiscordConfig(impersonation.tenantId)
  const tenantLabel = tenant ? `${tenant.name} (${tenant.slug})` : impersonation.tenantId
  const t = await getTranslations('impersonationBanner')

  return (
    <div className="bg-rose-600 text-white px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <Eye size={14} />
          <span>
            <strong>{t('label')}</strong> · {t('viewingAs', { tenant: tenantLabel })}
          </span>
        </div>
        <form action={endImpersonation}>
          <button
            type="submit"
            className="text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md"
          >
            {t('end')}
          </button>
        </form>
      </div>
    </div>
  )
}
