'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateAppSetting } from '@/app/actions/settings'
import { Save, RotateCcw } from 'lucide-react'

interface Props {
  initialText: string
  defaultText: string
}

const MAX_LENGTH = 500

export default function LandingCtaTextForm({ initialText, defaultText }: Props) {
  const router = useRouter()
  const [text, setText] = useState(initialText)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = text !== initialText
  const tooLong = text.length > MAX_LENGTH

  const handleSave = async () => {
    if (tooLong) {
      setError(`문구는 ${MAX_LENGTH}자를 넘을 수 없습니다.`)
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting('landing_cta_text', text)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  const handleResetToDefault = () => {
    setText('')
    setSaved(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white">대문 안내 문구</h2>
        <p className="text-gray-500 text-xs mt-1">
          로그인 전 대문 페이지에서 Discord 로그인 버튼 위에 노출되는 안내 문구입니다. 비워두면 기본 문구로 표시됩니다.
        </p>
        <p className="text-gray-500 text-[11px] mt-1">
          기본 문구: <span className="text-gray-400">{defaultText}</span>
        </p>
      </div>

      <div>
        <label className="text-gray-400 text-xs mb-1 block">문구</label>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSaved(false)
          }}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-y"
          placeholder={defaultText}
        />
        <div className="flex items-center justify-between mt-1">
          <span className={`text-[11px] ${tooLong ? 'text-red-400' : 'text-gray-500'}`}>
            {text.length}/{MAX_LENGTH}
          </span>
          {saved && !dirty && <span className="text-[11px] text-emerald-400">저장됨</span>}
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty || tooLong}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? '저장 중…' : '저장'}
        </button>
        <button
          type="button"
          onClick={handleResetToDefault}
          disabled={loading || text === ''}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/40 disabled:text-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors text-xs"
          title="저장 버튼을 눌러야 반영됩니다"
        >
          <RotateCcw size={12} />
          기본값으로 되돌리기
        </button>
      </div>
    </div>
  )
}
