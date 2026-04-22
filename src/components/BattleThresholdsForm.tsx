'use client'

// 킬로그 기반 배틀 판정 임계값 설정. 저장 후 다음 battle-aggregate cron 부터
// 반영. 이미 집계된 배틀은 재집계되지 않으므로 과거 결과는 그대로 유지.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Swords } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'

interface Props {
  initialWindowHours: number
  initialMinTotalPlayers: number
  initialMinGuildPlayers: number
}

const WINDOW_MIN = 1
const WINDOW_MAX = 6
const TOTAL_MIN = 10
const TOTAL_MAX = 200
const GUILD_MIN = 1
const GUILD_MAX = 20

function validInt(raw: string, min: number, max: number): boolean {
  const n = Number(raw)
  return Number.isFinite(n) && Number.isInteger(n) && n >= min && n <= max
}

export default function BattleThresholdsForm({
  initialWindowHours,
  initialMinTotalPlayers,
  initialMinGuildPlayers,
}: Props) {
  const router = useRouter()
  const [windowHours, setWindowHours] = useState(String(initialWindowHours))
  const [minTotal, setMinTotal] = useState(String(initialMinTotalPlayers))
  const [minGuild, setMinGuild] = useState(String(initialMinGuildPlayers))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const windowInvalid = !validInt(windowHours, WINDOW_MIN, WINDOW_MAX)
  const totalInvalid = !validInt(minTotal, TOTAL_MIN, TOTAL_MAX)
  const guildInvalid = !validInt(minGuild, GUILD_MIN, GUILD_MAX)
  const dirty =
    windowHours !== String(initialWindowHours) ||
    minTotal !== String(initialMinTotalPlayers) ||
    minGuild !== String(initialMinGuildPlayers)

  const handleSave = async () => {
    if (windowInvalid || totalInvalid || guildInvalid) {
      setError('입력값이 허용 범위를 벗어났습니다.')
      return
    }
    setLoading(true)
    setError('')
    setSaved(false)
    const r1 = await updateAppSetting('battle_window_hours', windowHours)
    if (r1.error) {
      setError(r1.error)
      setLoading(false)
      return
    }
    const r2 = await updateAppSetting('battle_min_total_players', minTotal)
    if (r2.error) {
      setError(r2.error)
      setLoading(false)
      return
    }
    const r3 = await updateAppSetting('battle_min_guild_players', minGuild)
    if (r3.error) {
      setError(r3.error)
      setLoading(false)
      return
    }
    setSaved(true)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Swords size={16} className="text-rose-400 mt-0.5" />
        <div>
          <h2 className="font-bold text-white">배틀 자동 판정 임계값</h2>
          <p className="text-gray-500 text-xs mt-1">
            이벤트 시작 후 몇 시간까지 킬을 집계할지, 그리고 소규모 교전·소수 인원 길드를 어떻게 제외할지 설정합니다.
            <br />
            <span className="text-rose-300/80">주의:</span> 저장 후 새로 시작되는 배틀부터 적용됩니다. 이미 집계 완료된 결과는 그대로 유지.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">
            배틀 윈도우 (시간)
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={WINDOW_MIN}
            max={WINDOW_MAX}
            value={windowHours}
            onChange={(e) => {
              setWindowHours(e.target.value)
              setSaved(false)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
          <p className={`text-[11px] mt-1 ${windowInvalid ? 'text-red-400' : 'text-gray-500'}`}>
            {WINDOW_MIN}~{WINDOW_MAX}시간. 이벤트 시작부터 이 시간 안에 발생한 킬만 배틀로 인정.
          </p>
        </div>

        <div>
          <label className="text-gray-400 text-xs mb-1 block">
            배틀 최소 총 인원
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={TOTAL_MIN}
            max={TOTAL_MAX}
            value={minTotal}
            onChange={(e) => {
              setMinTotal(e.target.value)
              setSaved(false)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
          <p className={`text-[11px] mt-1 ${totalInvalid ? 'text-red-400' : 'text-gray-500'}`}>
            {TOTAL_MIN}~{TOTAL_MAX}명. 이 수 미만이면 소규모 교전으로 간주해 판정 제외.
          </p>
        </div>

        <div>
          <label className="text-gray-400 text-xs mb-1 block">
            길드 최소 참여자
          </label>
          <input
            type="number"
            inputMode="numeric"
            min={GUILD_MIN}
            max={GUILD_MAX}
            value={minGuild}
            onChange={(e) => {
              setMinGuild(e.target.value)
              setSaved(false)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
          />
          <p className={`text-[11px] mt-1 ${guildInvalid ? 'text-red-400' : 'text-gray-500'}`}>
            {GUILD_MIN}~{GUILD_MAX}명. 참여 인원이 이 수 미만인 길드는 승/패 판정 대상에서 제외.
          </p>
        </div>
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
          disabled={loading || !dirty || windowInvalid || totalInvalid || guildInvalid}
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
