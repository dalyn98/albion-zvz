'use client'

import { Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  value: string
  onChange: (next: string) => void
  placeholder: string
}

export default function SearchBox({ value, onChange, placeholder }: Props) {
  const t = useTranslations('common')
  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-9 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('clearSearch')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
