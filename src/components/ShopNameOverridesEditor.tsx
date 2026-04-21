'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link as LinkIcon, Plus, X, Loader2 } from 'lucide-react'
import { upsertNameOverride, removeNameOverride } from '@/app/actions/shop-admin'

interface Override {
  itemName: string
  uniqueName: string
}

interface Props {
  initial: Override[]
}

export default function ShopNameOverridesEditor({ initial }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [name, setName] = useState('')
  const [unique, setUnique] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleAdd = () => {
    const n = name.trim()
    const u = unique.trim()
    if (!n || !u) {
      setError('둘 다 입력하세요.')
      return
    }
    setError('')
    startTransition(async () => {
      const result = await upsertNameOverride(n, u)
      if (result.error) {
        setError(result.error)
        return
      }
      setItems((prev) => {
        const filtered = prev.filter((p) => p.itemName !== n)
        return [{ itemName: n, uniqueName: u }, ...filtered]
      })
      setName('')
      setUnique('')
      router.refresh()
    })
  }

  const handleRemove = (itemName: string) => {
    startTransition(async () => {
      const result = await removeNameOverride(itemName)
      if (result.error) {
        setError(result.error)
        return
      }
      setItems(items.filter((i) => i.itemName !== itemName))
      router.refresh()
    })
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <LinkIcon size={16} className="text-gray-400" />
        <h2 className="font-bold text-white">이름 오버라이드</h2>
        <span className="text-xs text-gray-500">({items.length})</span>
      </div>
      <p className="text-gray-500 text-xs">
        번들 사전에 없거나 잘못 매칭되는 한글명을 직접 Albion UniqueName(예: <code className="text-gray-400">T6_HEAD_PLATE_SET1</code>)에 고정합니다. 오버라이드가 있으면 리졸버가 번들 사전보다 우선 사용.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="한글 아이템명"
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          disabled={pending}
        />
        <input
          type="text"
          value={unique}
          onChange={(e) => setUnique(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
          placeholder="UniqueName (예: T6_HEAD_PLATE_SET1)"
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 font-mono"
          disabled={pending}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !name.trim() || !unique.trim()}
          className="flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-3 py-2 rounded-lg transition-colors text-sm"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          저장
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {items.length > 0 ? (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {items.map((it) => (
            <div
              key={it.itemName}
              className="flex items-center gap-2 bg-gray-800/60 border border-gray-800 rounded-lg px-3 py-1.5 text-xs"
            >
              <span className="text-gray-200 flex-1 truncate">{it.itemName}</span>
              <span className="text-gray-600">→</span>
              <span className="text-gray-400 font-mono flex-1 truncate">{it.uniqueName}</span>
              <button
                type="button"
                onClick={() => handleRemove(it.itemName)}
                disabled={pending}
                className="text-gray-500 hover:text-red-300 disabled:text-gray-700 transition-colors shrink-0"
                title="제거"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500">비어있음</p>
      )}
    </div>
  )
}
