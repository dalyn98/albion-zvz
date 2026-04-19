'use client'

import { useEffect, useState, useTransition } from 'react'
import { FolderDown, Trash2, X } from 'lucide-react'
import {
  deleteSlotTemplate,
  getSlotTemplate,
  listSlotTemplates,
  type SlotTemplateSummary,
} from '@/app/actions/slot-templates'
import { applyTemplateToSlotInput } from '@/lib/slot-template-shape'
import type { SlotInput } from './SlotEditor'

interface Props {
  slot: SlotInput
  onLoad: (next: SlotInput) => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function LoadSlotTemplateButton({ slot, onLoad }: Props) {
  const [open, setOpen] = useState(false)
  const [templates, setTemplates] = useState<SlotTemplateSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setListLoading(true)
    setError('')
    listSlotTemplates()
      .then((result) => {
        if (cancelled) return
        if (result.error) setError(result.error)
        else setTemplates(result.templates)
      })
      .finally(() => {
        if (!cancelled) setListLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const apply = () => {
    if (!selected) return
    setError('')
    startTransition(async () => {
      const result = await getSlotTemplate(selected)
      if (result.error || !result.template) {
        setError(result.error ?? '템플릿을 찾을 수 없습니다.')
        return
      }
      const next = applyTemplateToSlotInput(slot, result.template.data)
      onLoad(next)
      setOpen(false)
    })
  }

  const remove = (id: string) => {
    setError('')
    startTransition(async () => {
      const result = await deleteSlotTemplate(id)
      if (result.error) {
        setError(result.error)
        return
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      if (selected === id) setSelected(null)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSelected(null)
          setError('')
          setOpen(true)
        }}
        className="flex items-center gap-1 text-[11px] font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-md px-2 py-1 transition-colors"
        title="저장된 빌드 템플릿에서 불러오기"
      >
        <FolderDown size={11} />
        템플릿 불러오기
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[80dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <h3 className="font-bold text-white text-base">슬롯 템플릿 불러오기</h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
              {listLoading ? (
                <p className="text-gray-500 text-xs text-center py-4">로드 중…</p>
              ) : templates.length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-4">
                  저장된 빌드 템플릿이 없습니다.
                </p>
              ) : (
                templates.map((t) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-1 rounded-lg border transition-colors ${
                      selected === t.id
                        ? 'bg-sky-500/20 border-sky-500/50'
                        : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(t.id)}
                      className="flex-1 flex items-center justify-between gap-2 px-3 py-2 text-left min-w-0"
                    >
                      <span className="text-white text-sm truncate">{t.name}</span>
                      <span className="text-gray-500 text-[10px] font-mono flex-shrink-0">
                        {formatDate(t.created_at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      disabled={pending}
                      className="p-2 text-gray-500 hover:text-red-400 flex-shrink-0 disabled:opacity-50"
                      aria-label={`${t.name} 삭제`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-700 flex-shrink-0">
              <p className="text-gray-500 text-[11px]">적용하면 현재 슬롯 내용이 덮어써집니다.</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => !pending && setOpen(false)}
                  className="text-gray-400 hover:text-white text-sm px-3 py-2"
                  disabled={pending}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={pending || !selected}
                  className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-lg text-sm"
                >
                  {pending ? '적용중...' : '적용'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
