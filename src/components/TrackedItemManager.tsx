'use client'

// 길드 재고 그리드 추적 등록 관리 UI.
//
// 검색 input + 자동완성 드롭다운, 등록된 베이스 칩 리스트 (X 제거), 기존 재고
// 일괄 가져오기 버튼. 추가/제거 후 router.refresh 로 페이지 데이터 재로드.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Plus, Search, Upload, X } from 'lucide-react'
import {
  addTrackedItemAction,
  importTrackedFromExistingInventoryAction,
  removeTrackedItemAction,
  searchTrackedItemsAction,
} from '@/app/actions/inventory-tracked'
import type { TrackedItemSearchEntry } from '@/lib/inventory-name-search'
import AlbionItemImage from './AlbionItemImage'
import { useToast } from './ToastProvider'

type Tracked = TrackedItemSearchEntry & { sortOrder: number }

interface Props {
  initialTracked: Tracked[]
}

export default function TrackedItemManager({ initialTracked }: Props) {
  const t = useTranslations('adminInventory')
  const locale = useLocale()
  const router = useRouter()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TrackedItemSearchEntry[]>([])
  const [showResults, setShowResults] = useState(false)
  const [, startTransition] = useTransition()
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const trimmedQuery = query.trim()

  // 디바운스된 검색. 빈 쿼리는 effect 밖 derived 로 처리.
  useEffect(() => {
    if (trimmedQuery.length < 1) return
    const timer = setTimeout(async () => {
      const r = await searchTrackedItemsAction({ query: trimmedQuery })
      if (r.error) {
        toast.error(r.error)
        return
      }
      setResults(r.results ?? [])
    }, 200)
    return () => clearTimeout(timer)
  }, [trimmedQuery, toast])

  // 외부 클릭 시 드롭다운 닫음.
  useEffect(() => {
    if (!showResults) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (wrapRef.current?.contains(target)) return
      setShowResults(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [showResults])

  const handleAdd = (suffix: string) => {
    startTransition(async () => {
      const r = await addTrackedItemAction({ baseSuffix: suffix })
      if (r.error) toast.error(r.error)
      else {
        setQuery('')
        setShowResults(false)
        router.refresh()
      }
    })
  }

  const handleRemove = (suffix: string) => {
    startTransition(async () => {
      const r = await removeTrackedItemAction({ baseSuffix: suffix })
      if (r.error) toast.error(r.error)
      else router.refresh()
    })
  }

  const handleImport = () => {
    startTransition(async () => {
      const r = await importTrackedFromExistingInventoryAction()
      if (r.error) toast.error(r.error)
      else {
        toast.success(t('importDoneMessage', { count: r.added ?? 0 }))
        router.refresh()
      }
    })
  }

  const trackedSuffixSet = new Set(initialTracked.map((t) => t.baseSuffix))
  const filteredResults =
    trimmedQuery.length < 1
      ? []
      : results.filter((r) => !trackedSuffixSet.has(r.baseSuffix))

  function getDisplayName(entry: TrackedItemSearchEntry): string {
    if (locale === 'en') return entry.displayEn
    if (locale === 'ja') return entry.displayJa
    if (locale === 'zh') return entry.displayZh
    return entry.displayKo
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-white">
          {t('trackedTitle', { count: initialTracked.length })}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">{t('trackedHint')}</p>
      </div>

      <div ref={wrapRef} className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowResults(true)
          }}
          onFocus={() => setShowResults(true)}
          placeholder={t('trackedSearchPlaceholder')}
          className="w-full bg-gray-950/40 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder:text-gray-500 focus:border-amber-500 focus:outline-none"
        />
        {showResults && trimmedQuery.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-2xl max-h-72 overflow-y-auto">
            {filteredResults.length === 0 ? (
              <p className="text-center text-gray-500 text-xs py-4">
                {t('trackedSearchEmpty')}
              </p>
            ) : (
              <ul>
                {filteredResults.map((r) => (
                  <li key={r.baseSuffix}>
                    <button
                      type="button"
                      onClick={() => handleAdd(r.baseSuffix)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-amber-500/10 text-left"
                    >
                      <AlbionItemImage
                        src={`https://render.albiononline.com/v1/item/${r.sampleItemId}.png`}
                        alt=""
                        width={32}
                        height={32}
                        className="object-contain pixel-img flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {getDisplayName(r)}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {t(`gearSlot.${r.slot}`)}
                          {r.armorMaterial &&
                            ` · ${t(`armorMaterial.${r.armorMaterial}`)}`}
                        </p>
                      </div>
                      <Plus size={14} className="text-amber-400 flex-shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {initialTracked.length === 0 ? (
        <div className="rounded-lg bg-gray-950/40 border border-gray-800 p-4 text-center space-y-3">
          <p className="text-sm text-gray-300">{t('trackedEmptyTitle')}</p>
          <p className="text-xs text-gray-500">{t('trackedEmptyHint')}</p>
          <button
            type="button"
            onClick={handleImport}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold border border-amber-500/40"
          >
            <Upload size={12} />
            {t('importFromExisting')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {initialTracked.map((row) => (
              <span
                key={row.baseSuffix}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-200"
              >
                <AlbionItemImage
                  src={`https://render.albiononline.com/v1/item/${row.sampleItemId}.png`}
                  alt=""
                  width={16}
                  height={16}
                  className="object-contain pixel-img"
                />
                <span className="truncate max-w-[160px]">
                  {getDisplayName(row)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(row.baseSuffix)}
                  className="text-gray-500 hover:text-rose-300"
                  aria-label={t('btnRemoveTracked')}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={handleImport}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-amber-300 hover:bg-amber-500/10"
          >
            <Upload size={12} />
            {t('importFromExisting')}
          </button>
        </>
      )}
    </div>
  )
}
