import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { KeyRound } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getSession, sessionHas } from '@/lib/session'
import { CAP } from '@/lib/permissions'
import { listPermissions } from '@/app/actions/permissions'
import PermissionsEditor from './PermissionsEditor'

// `force-dynamic` 은 admin 라우트 공통 — 세션/길드별 데이터가 빌드타임에 박히면
// 안 된다. AGENTS.md 의 "force-static 금지" hard rule 과 같은 맥락.
export const dynamic = 'force-dynamic'

export default async function PermissionsPage() {
  const session = await getSession()
  if (!session || !sessionHas(session, CAP.SETTINGS_PERMISSIONS)) redirect('/')

  const t = await getTranslations('permissions')
  const { roleGrants, userOverrides, error } = await listPermissions()

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <KeyRound size={22} className="text-amber-300" />
          {t('heading')}
        </h1>
        <p className="text-sm text-gray-400 max-w-2xl">{t('description')}</p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <Suspense fallback={<div className="text-sm text-gray-500">…</div>}>
        <PermissionsEditor
          initialRoleGrants={roleGrants}
          initialUserOverrides={userOverrides}
        />
      </Suspense>
    </div>
  )
}
