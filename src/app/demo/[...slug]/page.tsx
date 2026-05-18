import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import {
  Swords,
  Hammer,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  ArrowLeft,
  ClipboardList,
  Box,
} from 'lucide-react'

// 데모 사이드바엔 노출되지만 페이지 자체는 아직 구현 전인 라우트들을 위한
// "프리뷰" 화면. 그냥 404 대신 — 어떤 기능인지, 실 앱에서 어떻게 동작하는지
// 한 화면에 보여주고 봇 초대 CTA 로 이어준다. 슬러그가 매핑 테이블에 없으면
// 기본 not-found 로 폴백.

type FeatureKey =
  | 'battles'
  | 'craft'
  | 'craft/queue'
  | 'craft/my-tasks'
  | 'craft/orders'
  | 'guide'

type FeatureSpec = {
  icon: React.ComponentType<{ size?: number; className?: string }>
  navKey: string
  descKey: string
  accent: 'amber' | 'rose' | 'indigo' | 'emerald' | 'sky' | 'fuchsia'
}

const FEATURE_MAP: Record<FeatureKey, FeatureSpec> = {
  battles: { icon: Swords, navKey: 'battles', descKey: 'battles', accent: 'rose' },
  craft: { icon: Hammer, navKey: 'craftAdmin', descKey: 'craftAdmin', accent: 'amber' },
  'craft/queue': { icon: Hammer, navKey: 'craftQueue', descKey: 'craftQueue', accent: 'amber' },
  'craft/my-tasks': { icon: Box, navKey: 'craftMyTasks', descKey: 'craftMyTasks', accent: 'amber' },
  'craft/orders': { icon: ClipboardList, navKey: 'craftOrders', descKey: 'craftOrders', accent: 'amber' },
  guide: { icon: BookOpen, navKey: 'guide', descKey: 'guide', accent: 'sky' },
}

// Tailwind JIT 가 클래스를 식별해야 해 정적 객체로 미리 풀어둔다.
const ACCENT_STYLES: Record<FeatureSpec['accent'], { text: string; ring: string; bg: string }> = {
  amber: { text: 'text-amber-300', ring: 'border-amber-500/30', bg: 'bg-amber-500/10' },
  rose: { text: 'text-rose-300', ring: 'border-rose-500/30', bg: 'bg-rose-500/10' },
  indigo: { text: 'text-indigo-300', ring: 'border-indigo-500/30', bg: 'bg-indigo-500/10' },
  emerald: { text: 'text-emerald-300', ring: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
  sky: { text: 'text-sky-300', ring: 'border-sky-500/30', bg: 'bg-sky-500/10' },
  fuchsia: { text: 'text-fuchsia-300', ring: 'border-fuchsia-500/30', bg: 'bg-fuchsia-500/10' },
}

export default async function DemoCatchAllPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const path = slug.join('/') as FeatureKey
  const feature = FEATURE_MAP[path]
  if (!feature) notFound()

  const [tNav, tPreview] = await Promise.all([
    getTranslations('nav'),
    getTranslations('demo.featurePreview'),
  ])

  const Icon = feature.icon
  const accent = ACCENT_STYLES[feature.accent]
  const featureName = tNav(feature.navKey as Parameters<typeof tNav>[0])

  // 일관성 — 모든 프리뷰가 동일한 3개 benefit 을 보여준다 (i18n 키는 단 3개로 모든 기능 커버).
  const bullets = [
    tPreview('bulletRealData'),
    tPreview('bulletAutoSync'),
    tPreview('bulletInstantInvite'),
  ]

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-2xl space-y-6 rounded-xl border border-gray-700 bg-gray-900/60 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div
            className={`inline-flex h-12 w-12 items-center justify-center rounded-lg border ${accent.ring} ${accent.bg} ${accent.text}`}
          >
            <Icon size={22} />
          </div>
          <div className="space-y-0.5">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${accent.text}`}>
              {tPreview('eyebrow')}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
              {featureName}
            </h1>
          </div>
        </div>

        <p className="text-sm text-gray-300 leading-relaxed">
          {tPreview(`descriptions.${feature.descKey}` as Parameters<typeof tPreview>[0])}
        </p>

        <ul className="space-y-2">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-gray-300">
              <CheckCircle2 size={16} className={`${accent.text} mt-0.5 shrink-0`} />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Link
            href="/demo"
            className="inline-flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <ArrowLeft size={14} />
            {tPreview('backToDemo')}
          </Link>
          <a
            href="/api/auth/discord/start?returnTo=/"
            className="inline-flex items-center justify-center gap-1.5 bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold px-4 py-2 rounded-lg text-sm transition-colors flex-1"
          >
            <ExternalLink size={14} />
            {tPreview('inviteBot')}
          </a>
        </div>
      </div>
    </div>
  )
}
