import {
  GitBranch,
  Hourglass,
  Minus,
  Skull,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import type { GuildBattleDisplayResult } from '@/lib/guild-battle-view'
import { cx } from '@/components/ui-patterns'

const RESULT_TONES: Record<
  GuildBattleDisplayResult,
  {
    Icon: LucideIcon
    className: string
  }
> = {
  advantage: {
    Icon: Trophy,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  disadvantage: {
    Icon: Skull,
    className: 'border-red-500/30 bg-red-500/10 text-red-300',
  },
  even: {
    Icon: Minus,
    className: 'border-gray-500/30 bg-gray-500/10 text-gray-300',
  },
  mixed: {
    Icon: GitBranch,
    className: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  },
  pending: {
    Icon: Hourglass,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  },
}

export function battleResultTextClass(result: GuildBattleDisplayResult): string {
  if (result === 'advantage') return 'text-emerald-300'
  if (result === 'disadvantage') return 'text-red-300'
  if (result === 'even') return 'text-gray-300'
  if (result === 'mixed') return 'text-violet-300'
  return 'text-amber-300'
}

export function BattleResultBadge({
  result,
  label,
  className,
  iconSize = 12,
}: {
  result: GuildBattleDisplayResult
  label: string
  className?: string
  iconSize?: number
}) {
  const tone = RESULT_TONES[result]
  const Icon = tone.Icon

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 font-sans text-xs font-semibold leading-none tracking-normal',
        tone.className,
        className,
      )}
    >
      <Icon size={iconSize} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
