'use client'

import { useState, useTransition } from 'react'
import { Save, X } from 'lucide-react'
import { saveSlotAsTemplate } from '@/app/actions/slot-templates'
import { slotInputToTemplateData } from '@/lib/slot-template-shape'
import type { SlotInput } from './SlotEditor'

interface Props {
  slot: SlotInput
  defaultName: string
}

const MAX_NAME_LENGTH = 80

export default function SaveSlotAsTemplateButton({ slot, defaultName }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError('')
    setSaved(false)
    startTransition(async () => {
      const data = slotInputToTemplateData(slot)
      const result = await saveSlotAsTemplate(name, data)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      setOpen(false)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setName(defaultName)
          setError('')
          setSaved(false)
          setOpen(true)
        }}
        className="flex items-center gap-1 text-[11px] font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-md px-2 py-1 transition-colors"
        title="이 슬롯만 템플릿으로 저장"
      >
        <Save size={11} />
        템플릿 저장
      </button>

      {saved && (
        <span className="text-[11px] text-emerald-400 ml-1 self-center">저장됨</span>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 className="font-bold text-white text-base">슬롯 템플릿 저장</h3>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                className="p-1 text-gray-400 hover:text-white"
                aria-label="닫기"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-gray-400 text-xs">
                이 슬롯의 역할·메모·장비·스킬 구성이 하나의 빌드 템플릿으로 저장됩니다. 신청자 정보는 포함되지 않아요.
              </p>
              <div>
                <label className="text-gray-400 text-xs font-semibold block mb-1">템플릿 이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 메인 힐러 빌드"
                  maxLength={MAX_NAME_LENGTH}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  <p className="text-red-400 text-xs">{error}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
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
                onClick={submit}
                disabled={pending || !name.trim()}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold px-4 py-2 rounded-lg text-sm"
              >
                {pending ? '저장중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
