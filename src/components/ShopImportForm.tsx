'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Check, AlertCircle, Loader2, Ban, Package } from 'lucide-react'
import { importChestLog, addBlacklist, type ImportSummary } from '@/app/actions/shop-admin'

const PLACEHOLDER = `예시:
"04/21/2026 15:59:10"\t"SoonSem"\t"페기물"\t"0"\t"1"\t"-1"
"04/21/2026 13:42:13"\t"WarGloves"\t"스위프트클로"\t"1"\t"2"\t"1"
`

export default function ShopImportForm() {
  const router = useRouter()
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [blacklistingName, setBlacklistingName] = useState<string | null>(null)

  const handleSubmit = () => {
    const raw = text.trim()
    if (!raw) return
    startTransition(async () => {
      const result = await importChestLog(raw)
      setSummary(result)
      if (!result.error) {
        router.refresh()
      }
    })
  }

  const handleBlacklist = (name: string) => {
    setBlacklistingName(name)
    startTransition(async () => {
      await addBlacklist(name)
      setSummary((prev) =>
        prev
          ? { ...prev, unresolvedNames: prev.unresolvedNames.filter((n) => n !== name) }
          : prev,
      )
      router.refresh()
      setBlacklistingName(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-bold text-white">로그 임포트</h2>
          <p className="text-gray-500 text-xs mt-1">
            인게임 "은행"에서 복사한 입출 로그를 붙여넣으세요. 탭 구분 6열(날짜 / 플레이어 / 아이템 /
            인챈트 / 품질 / 수량) — TextEdit .rtf, 메모장 .txt 모두 지원.
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 font-mono resize-y"
          placeholder={PLACEHOLDER}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !text.trim()}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {pending ? '반영 중…' : '반영'}
          </button>
          <button
            type="button"
            onClick={() => {
              setText('')
              setSummary(null)
            }}
            disabled={pending || !text}
            className="text-xs text-gray-400 hover:text-gray-200 disabled:text-gray-700"
          >
            초기화
          </button>
        </div>
      </div>

      {summary && <ImportResult summary={summary} onBlacklist={handleBlacklist} blacklistingName={blacklistingName} pending={pending} />}
    </div>
  )
}

function ImportResult({
  summary,
  onBlacklist,
  blacklistingName,
  pending,
}: {
  summary: ImportSummary
  onBlacklist: (name: string) => void
  blacklistingName: string | null
  pending: boolean
}) {
  return (
    <div className="space-y-3">
      {summary.error && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-red-300 text-sm">{summary.error}</p>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Check size={16} className="text-emerald-400" />
          <h3 className="font-bold text-white">반영 결과</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCell label="파싱" value={summary.parsed} />
          <StatCell label="신규 적재" value={summary.inserted} accent="emerald" />
          <StatCell label="중복 스킵" value={summary.duplicatesSkipped} />
          <StatCell label="블랙리스트" value={summary.blacklistedRows} />
          <StatCell label="미해결" value={summary.unresolvedRows} accent={summary.unresolvedRows > 0 ? 'amber' : undefined} />
        </div>
        {summary.parseErrors.length > 0 && (
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-300">파싱 실패 {summary.parseErrors.length}행</p>
            {summary.parseErrors.slice(0, 3).map((e) => (
              <p key={e.line} className="font-mono truncate">#{e.line} {e.text}</p>
            ))}
            {summary.parseErrors.length > 3 && (
              <p className="text-gray-500">... 외 {summary.parseErrors.length - 3}건</p>
            )}
          </div>
        )}
      </div>

      {summary.unresolvedNames.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-400" />
            <h3 className="font-bold text-white">
              미해결 아이템 ({summary.unresolvedNames.length}개)
            </h3>
          </div>
          <p className="text-gray-400 text-xs">
            번들 사전에서 한글명 매칭에 실패했습니다. 잡템이면 블랙리스트에 추가하고, 그 외엔 "이름
            오버라이드"에서 UniqueName 을 수동으로 지정하세요.
          </p>
          <div className="flex flex-wrap gap-2">
            {summary.unresolvedNames.map((name) => (
              <div
                key={name}
                className="flex items-center gap-1.5 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs"
              >
                <span className="text-gray-200">{name}</span>
                <button
                  type="button"
                  onClick={() => onBlacklist(name)}
                  disabled={pending}
                  className="flex items-center gap-1 text-gray-500 hover:text-red-300 disabled:text-gray-700 transition-colors"
                  title="블랙리스트에 추가"
                >
                  {blacklistingName === name ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Ban size={10} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.stockChanges.length > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-emerald-400" />
            <h3 className="font-bold text-white">재고 변동 ({summary.stockChanges.length}개)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="text-left font-normal pb-2">아이템</th>
                  <th className="text-center font-normal pb-2 w-16">@</th>
                  <th className="text-center font-normal pb-2 w-16">Q</th>
                  <th className="text-right font-normal pb-2 w-20">변동</th>
                  <th className="text-right font-normal pb-2 w-20">재고</th>
                </tr>
              </thead>
              <tbody>
                {summary.stockChanges.slice(0, 50).map((c) => (
                  <tr key={`${c.uniqueName}|${c.enchant}|${c.quality}`} className="border-b border-gray-800/50">
                    <td className="py-1.5 text-gray-200 text-xs">{c.nameKo}</td>
                    <td className="py-1.5 text-gray-500 text-center text-xs">{c.enchant}</td>
                    <td className="py-1.5 text-gray-500 text-center text-xs">{c.quality}</td>
                    <td className={`py-1.5 text-right text-xs font-mono ${c.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {c.delta > 0 ? `+${c.delta}` : c.delta}
                    </td>
                    <td className="py-1.5 text-right text-xs font-mono text-white">{c.newStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {summary.stockChanges.length > 50 && (
              <p className="text-xs text-gray-500 mt-2">
                ... 외 {summary.stockChanges.length - 50}개 아이템
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: 'emerald' | 'amber'
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'amber'
      ? 'text-amber-300'
      : 'text-white'
  return (
    <div className="bg-gray-800/60 rounded-lg px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value.toLocaleString()}</p>
    </div>
  )
}
