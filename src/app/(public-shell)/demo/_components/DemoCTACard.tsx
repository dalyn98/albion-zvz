import { ExternalLink, Sparkles } from 'lucide-react'

// 데모 페이지 하단에 붙는 문맥형 CTA 카드. 페이지마다 다른 title/description 으로
// "이 흐름을 우리 길드에 그대로 도입하려면" 메시지를 전달하고 Discord 봇 초대로
// 유도한다. 서버 컴포넌트 — 상호작용 없음, RSC 에서 직접 사용 가능.

interface DemoCTACardProps {
  eyebrow: string
  title: string
  description: string
  buttonLabel: string
  href?: string
  variant?: 'amber' | 'emerald'
}

const DEFAULT_HREF = '/api/auth/discord/start?returnTo=/'

export default function DemoCTACard({
  eyebrow,
  title,
  description,
  buttonLabel,
  href = DEFAULT_HREF,
  variant = 'amber',
}: DemoCTACardProps) {
  const accent =
    variant === 'emerald'
      ? {
          ring: 'border-emerald-500/40',
          bg: 'bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent',
          eye: 'text-emerald-300',
          btn: 'bg-emerald-500 hover:bg-emerald-400 text-black',
        }
      : {
          ring: 'border-amber-500/40',
          bg: 'bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent',
          eye: 'text-amber-300',
          btn: 'bg-amber-500 hover:bg-amber-400 text-black',
        }

  return (
    <section
      className={`relative overflow-hidden rounded-xl border ${accent.ring} ${accent.bg} px-5 py-5 sm:px-6 sm:py-6`}
    >
      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5 max-w-2xl">
          <p
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${accent.eye}`}
          >
            <Sparkles size={11} />
            {eyebrow}
          </p>
          <h3 className="text-base sm:text-lg font-bold text-white">{title}</h3>
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">{description}</p>
        </div>
        <a
          href={href}
          className={`group inline-flex shrink-0 items-center gap-2 ${accent.btn} font-bold px-4 py-2.5 rounded-lg text-xs sm:text-sm shadow-lg transition-all hover:-translate-y-0.5`}
        >
          {buttonLabel}
          <ExternalLink
            size={13}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </a>
      </div>
    </section>
  )
}
