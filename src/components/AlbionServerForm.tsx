'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Globe2 } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

export type AlbionServer = 'west' | 'east' | 'europe'

interface Props {
  initialServer: AlbionServer
}

const OPTIONS: ReadonlyArray<{
  value: AlbionServer
  label: string
  hint: string
}> = [
  { value: 'east', label: 'East (Asia)', hint: 'gameinfo-sgp · albionbb east' },
  { value: 'west', label: 'West (Americas)', hint: 'gameinfo · 기존 원본 서버' },
  { value: 'europe', label: 'Europe', hint: 'gameinfo-ams · 유럽 서버' },
]

export default function AlbionServerForm({ initialServer }: Props) {
  const router = useRouter()
  const [server, setServer] = useState<AlbionServer>(initialServer)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty = server !== initialServer

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const result = await updateAppSetting('albion_server', server)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Globe2 size={16} className="text-amber-400 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">알비온 서버</h2>
          <p className="text-gray-500 text-xs mt-1">
            리기어 자동 검증이 붙을 킬보드 서버입니다. 잘못 설정되면 /search 와 /deaths 가 비어서
            리기어가 매번 미검증으로 들어옵니다.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer select-none transition-colors ${
              server === opt.value
                ? 'border-amber-500/60 bg-amber-500/10'
                : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
            }`}
          >
            <input
              type="radio"
              name="albion-server"
              value={opt.value}
              checked={server === opt.value}
              onChange={() => {
                setServer(opt.value)
                setSaved(false)
              }}
              className="mt-1 accent-amber-500"
            />
            <span className="flex-1">
              <span className="text-sm text-white font-semibold">{opt.label}</span>
              <span className="block text-[11px] text-gray-500 mt-0.5 font-mono">{opt.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? '저장 중…' : '저장'}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">저장됨</span>}
      </div>
    </div>
  )
}
