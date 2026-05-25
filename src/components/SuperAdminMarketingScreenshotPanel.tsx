'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  Check,
  Pencil,
} from 'lucide-react'
import {
  uploadMarketingScreenshot,
  deleteMarketingScreenshot,
  moveMarketingScreenshot,
  updateMarketingScreenshotAlt,
} from '@/app/actions/marketing-screenshots'
import { useConfirm } from '@/components/ConfirmDialog'
import type {
  MarketingScreenshotImage,
  MarketingScreenshotKey,
} from '@/lib/marketing-screenshots'

interface Props {
  slot: MarketingScreenshotKey
  label: string
  images: MarketingScreenshotImage[]
}

export default function SuperAdminMarketingScreenshotPanel({
  slot,
  label,
  images,
}: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editingAlt, setEditingAlt] = useState<string | null>(null)
  const [altDraft, setAltDraft] = useState('')
  const askConfirm = useConfirm()
  const databaseImageCount = images.filter((img) => img.source === 'database').length

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setError(null)
    const fileArray = Array.from(files)
    startTransition(async () => {
      let hasError = false
      for (const file of fileArray) {
        const fd = new FormData()
        fd.set('slot', slot)
        fd.set('file', file)
        const { error } = await uploadMarketingScreenshot(fd)
        if (error) {
          setError(error)
          hasError = true
          break
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (!hasError) router.refresh()
    })
  }

  async function handleDelete(id: string) {
    const ok = await askConfirm({ body: '이 이미지를 삭제하시겠습니까?', destructive: true })
    if (!ok) return
    setError(null)
    startTransition(async () => {
      const { error } = await deleteMarketingScreenshot(id)
      if (error) setError(error)
      else router.refresh()
    })
  }

  function handleMove(id: string, direction: 'up' | 'down') {
    setError(null)
    startTransition(async () => {
      const { error } = await moveMarketingScreenshot(id, direction)
      if (error) setError(error)
      else router.refresh()
    })
  }

  function handleSaveAlt(id: string) {
    setError(null)
    startTransition(async () => {
      const { error } = await updateMarketingScreenshotAlt(id, altDraft)
      if (error) setError(error)
      else {
        setEditingAlt(null)
        setAltDraft('')
        router.refresh()
      }
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">{label}</h3>
          <p className="text-xs text-gray-500">
            슬롯 키: <code className="text-gray-400">{slot}</code> · 업로드 {databaseImageCount}장
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={handleUpload}
            disabled={isPending}
            className="hidden"
            id={`upload-${slot}`}
          />
          <label
            htmlFor={`upload-${slot}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isPending
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-amber-500 text-gray-950 hover:bg-amber-400 cursor-pointer'
            }`}
          >
            {isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Upload size={13} />
            )}
            <span>업로드 (여러 장 선택 가능)</span>
          </label>
        </div>
      </header>

      {error && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {images.length === 0 ? (
        <div className="text-center py-8 text-gray-600 text-xs">
          아직 등록된 이미지가 없어요. 위 버튼으로 업로드해주세요.
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {images.map((img, idx) => {
            const isFallback = img.source === 'fallback'
            return (
            <li
              key={img.id}
              className="bg-gray-950 border border-gray-800 rounded-lg overflow-hidden flex flex-col"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt ?? label}
                className="w-full aspect-video object-cover"
              />
              <div className="p-2 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-gray-500">
                  <span>{isFallback ? '기본 이미지' : `#${idx + 1}`}</span>
                  {!isFallback && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleMove(img.id, 'up')}
                        disabled={idx === 0 || isPending}
                        aria-label="위로 이동"
                        className="p-1 hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(img.id, 'down')}
                        disabled={idx === images.length - 1 || isPending}
                        aria-label="아래로 이동"
                        className="p-1 hover:bg-gray-800 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ArrowDown size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(img.id)}
                        disabled={isPending}
                        aria-label="삭제"
                        className="p-1 hover:bg-rose-500/20 hover:text-rose-300 rounded disabled:opacity-30"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                </div>
                {isFallback ? (
                  <p className="text-gray-500 truncate">
                    DB 이미지가 없을 때 공개 랜딩에 쓰는 기본 캡처입니다.
                  </p>
                ) : editingAlt === img.id ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={altDraft}
                      onChange={(e) => setAltDraft(e.target.value)}
                      placeholder="대체 텍스트"
                      maxLength={120}
                      className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[11px] text-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveAlt(img.id)}
                      disabled={isPending}
                      className="px-1.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded"
                      aria-label="저장"
                    >
                      <Check size={11} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAlt(img.id)
                      setAltDraft(img.alt ?? '')
                    }}
                    className="w-full text-left text-gray-500 hover:text-gray-300 truncate flex items-center gap-1"
                  >
                    <Pencil size={9} className="flex-shrink-0" />
                    <span className="truncate">
                      {img.alt ?? '대체 텍스트 없음 (눌러서 편집)'}
                    </span>
                  </button>
                )}
              </div>
            </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
