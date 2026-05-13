'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Ban, Plus, X, Loader2 } from 'lucide-react'
import { addBlacklist, removeBlacklist } from '@/app/actions/shop-admin'
import { useReportDirty } from './UnsavedChangesProvider'

interface Props {
  initial: string[]
}

export default function ShopBlacklistEditor({ initial }: Props) {
  const router = useRouter()
  const t = useTranslations('adminShopBlacklist')
  const [items, setItems] = useState(initial)
  const [input, setInput] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // 입력란에 미추가 텍스트가 남아있는 동안만 작성 중. 추가/삭제는 즉시 서버 반영.
  useReportDirty('shop-blacklist', input.trim() !== '')

  const handleAdd = () => {
    const name = input.trim()
    if (!name) return
    if (items.includes(name)) {
      setError(t('alreadyExists'))
      return
    }
    setError('')
    startTransition(async () => {
      const result = await addBlacklist(name)
      if (result.error) {
        setError(result.error)
        return
      }
      setItems([name, ...items])
      setInput('')
      router.refresh()
    })
  }

  const handleRemove = (name: string) => {
    startTransition(async () => {
      const result = await removeBlacklist(name)
      if (result.error) {
        setError(result.error)
        return
      }
      setItems(items.filter((i) => i !== name))
      router.refresh()
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Ban size={16} className="text-gray-400" />
        <h2 className="font-bold text-white">{t('title')}</h2>
        <span className="text-xs text-gray-500">({items.length})</span>
      </div>
      <p className="text-gray-500 text-xs">{t('description')}</p>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
          placeholder={t('addPlaceholder')}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          disabled={pending}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !input.trim()}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-3 py-2 rounded-lg transition-colors text-sm"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          {t('addButton')}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs"
            >
              <span className="text-gray-200">{name}</span>
              <button
                type="button"
                onClick={() => handleRemove(name)}
                disabled={pending}
                className="text-gray-500 hover:text-red-300 disabled:text-gray-700 transition-colors"
                title={t('removeTitle')}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">{t('empty')}</p>
      )}
    </div>
  )
}
