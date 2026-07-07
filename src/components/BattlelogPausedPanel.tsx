import { PauseCircle, Wrench } from 'lucide-react'

interface BattlelogPausedPanelProps {
  eyebrow: string
  title: string
  body: string
  detail?: string
}

export default function BattlelogPausedPanel({
  eyebrow,
  title,
  body,
  detail,
}: BattlelogPausedPanelProps) {
  return (
    <section className="rounded-lg border border-amber-300/25 bg-gray-950/80 p-5 shadow-[0_0_0_1px_rgba(251,191,36,0.08)] sm:p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-amber-300/30 bg-amber-300/10 text-amber-200">
          <PauseCircle size={22} />
        </div>
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-200">
            <Wrench size={12} />
            {eyebrow}
          </p>
          <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-300">{body}</p>
          {detail ? (
            <p className="mt-3 max-w-2xl text-xs leading-5 text-gray-500">{detail}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
