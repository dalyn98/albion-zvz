'use client'

import { ExternalLink, Sparkles } from 'lucide-react'
import { usePathname } from 'next/navigation'
import {
  balancedHeadingClass,
  cx,
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

const DEFAULT_HREF = '/login?returnTo=%2F'

export default function DemoCTACard({
  eyebrow,
  title,
  description,
  buttonLabel,
  href = DEFAULT_HREF,
  variant = 'amber',
}: DemoCTACardProps) {
  const pathname = usePathname()
  // Conversion is a shell concern, not the last card of every workflow. The
  // persistent demo banner already provides the global exit; keep one fuller
  // invitation only on the demo's situation page.
  if (pathname !== '/demo') return null

  const accent =
    variant === 'emerald'
      ? {
          ring: 'border-emerald-500/40',
          bg: 'bg-emerald-500/[0.06]',
          eye: 'text-emerald-300',
          btn: 'bg-emerald-500 hover:bg-emerald-400 text-black',
        }
      : {
          ring: 'border-amber-500/40',
          bg: 'bg-amber-500/[0.06]',
          eye: 'text-amber-300',
          btn: 'bg-amber-500 hover:bg-amber-400 text-black',
        }

  return (
    <section
      className={cx(
        'v3-demo-cta relative overflow-hidden border-y px-4 py-4 sm:px-5',
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
            'group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-4 py-2.5 text-xs font-bold transition-[background-color,transform] duration-200 ease-out sm:text-sm',
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
