import Link from 'next/link'
import { ExternalLink, Info } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { resolveTenantBySlug } from '@/lib/tenant-resolver'
import { getAdminClient } from '@/lib/supabase-admin'
import { loadGuildProfileSettings } from '@/lib/guild-profile'
import GuildProfileEditor from '@/components/GuildProfileEditor'

export const dynamic = 'force-dynamic'

// 어드민이 공개 길드 프로필 (/g/<슬러그>) 의 색상 테마, 모집 상태, Discord
// 초대 링크를 편집한다. 배너·갤러리·섹션 노출 토글은 인라인 편집으로 옮겨갔다
// (어드민이 공개 페이지에서 직접 편집).
// guild_profile_enabled 플래그가 false 면 "기능 미활성화" 라벨로 가린다 — 단계적
// 롤아웃을 위한 길드 단위 게이트.
export default async function GuildProfileAdminPage() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const tenantId = await getSessionGuildId(session)
  const t = await getTranslations('adminGuildProfile')

  const settings = await loadGuildProfileSettings(tenantId)

  // 슬러그 미리보기 — 어드민이 "내 프로필 보기" 링크로 새 탭에서 확인할 수 있게.
  const db = getAdminClient()
  const { data: tenantRow } = await db
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle()
  const slug = (tenantRow?.slug as string | undefined) ?? null
  const tenant = slug ? await resolveTenantBySlug(slug) : null
  const previewHref = tenant ? `/g/${tenant.slug}` : null

  if (!settings.enabled) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('pageTitle')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('pageDescription')}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-5 py-6 space-y-2">
          <h2 className="text-amber-200 font-bold">{t('disabledTitle')}</h2>
          <p className="text-gray-300 text-sm">{t('disabledDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('pageTitle')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('pageDescription')}</p>
        </div>
        {previewHref && (
          <Link
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-colors"
          >
            <ExternalLink size={12} />
            {t('previewLink')}
          </Link>
        )}
      </div>

      {previewHref && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <Info size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1.5 min-w-0">
            <p className="text-amber-200 text-xs font-bold">{t('inlineEditNoticeTitle')}</p>
            <p className="text-gray-400 text-xs leading-relaxed">{t('inlineEditNoticeBody')}</p>
            <Link
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 text-xs font-semibold mt-1"
            >
              {t('inlineEditNoticeLink')}
              <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      )}

      <GuildProfileEditor
        initialDescription={settings.description}
        initialAccentColor={settings.accentColor}
        initialRecruitmentStatus={settings.recruitmentStatus}
        initialDiscordInviteUrl={settings.discordInviteUrl}
      />
    </div>
  )
}
