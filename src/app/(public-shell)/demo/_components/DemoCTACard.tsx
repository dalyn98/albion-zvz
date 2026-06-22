import { ExternalLink, Sparkles } from 'lucide-react'
import {
  balancedHeadingClass,
  cx,
  interactiveSurfaceClass,
  pressScaleClass,
  prettyTextClass,
} from '@/components/ui-patterns'

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
      className={cx(
        'relative overflow-hidden rounded-xl border px-5 py-5 sm:px-6 sm:py-6',
        interactiveSurfaceClass,
        accent.ring,
        accent.bg,
      )}
    >
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5 max-w-2xl">
          <p
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${accent.eye}`}
          >
            <Sparkles size={11} />
            {eyebrow}
          </p>
          <h3 className={cx('text-base font-bold text-white sm:text-lg', balancedHeadingClass)}>
            {title}
          </h3>
          <p className={cx('text-xs leading-relaxed text-gray-300 sm:text-sm', prettyTextClass)}>
            {description}
          </p>
        </div>
        <a
          href={href}
          className={cx(
            'group inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold shadow-lg transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 sm:text-sm',
            pressScaleClass,
            accent.btn,
          )}
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
