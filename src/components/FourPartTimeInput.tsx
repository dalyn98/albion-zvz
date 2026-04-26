'use client'

import type { GatherTimeParts } from '@/lib/gather-time'

type PartKey = keyof GatherTimeParts

const PART_BOUNDS: Record<PartKey, { min: number; max: number }> = {
  month: { min: 1, max: 12 },
  day: { min: 1, max: 31 },
  hour: { min: 0, max: 23 },
  minute: { min: 0, max: 59 },
}

const ORDER: readonly PartKey[] = ['month', 'day', 'hour', 'minute'] as const

export const BLANK_GATHER_PARTS: GatherTimeParts = {
  month: Number.NaN,
  day: Number.NaN,
  hour: Number.NaN,
  minute: Number.NaN,
}

export function isAllBlank(parts: GatherTimeParts): boolean {
  return ORDER.every((k) => Number.isNaN(parts[k]))
}

interface Props {
  parts: GatherTimeParts
  onChange: (next: GatherTimeParts) => void
  labels: { month: string; day: string; hour: string; minute: string }
  size?: 'compact' | 'comfortable'
}

// 월/일/시/분 4분할 시간 입력. 모바일에서 datetime-local 키패드가 일관되지
// 않게 뜨는 문제를 피하려고 도입했고, 이벤트 집결 시간/리기어 윈도우 마감/
// 시스템 공지 만료 등 모든 시간 입력을 한 컴포넌트로 통일한다.
export default function FourPartTimeInput({
  parts,
  onChange,
  labels,
  size = 'comfortable',
}: Props) {
  const inputCls =
    size === 'compact'
      ? 'w-full rounded-md bg-gray-950 border border-gray-700 pl-2 pr-5 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
      : 'w-full bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-7 py-2.5 text-base text-white focus:outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
  const suffixCls =
    size === 'compact'
      ? 'absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs pointer-events-none'
      : 'absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none'
  const gridCls = size === 'compact' ? 'grid grid-cols-4 gap-1.5' : 'grid grid-cols-4 gap-2'

  const partSuffix = (key: PartKey): string => labels[key]

  const handlePartChange = (key: PartKey, raw: string) => {
    const next = raw === '' ? Number.NaN : Number(raw)
    onChange({ ...parts, [key]: next })
  }

  return (
    <div className={gridCls}>
      {ORDER.map((key) => {
        const bounds = PART_BOUNDS[key]
        const value = parts[key]
        const suffix = partSuffix(key)
        return (
          <div key={key} className="relative">
            <input
              type="number"
              inputMode="numeric"
              min={bounds.min}
              max={bounds.max}
              value={Number.isNaN(value) ? '' : value}
              onChange={(e) => handlePartChange(key, e.target.value)}
              className={inputCls}
              aria-label={suffix}
            />
            <span className={suffixCls}>{suffix}</span>
          </div>
        )
      })}
    </div>
  )
}
