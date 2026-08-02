'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import FourPartTimeInput, { BLANK_GATHER_PARTS, isAllBlank } from '@/components/FourPartTimeInput'
import { parseGatherTime, formatGatherTimeKo, type GatherTimeParts } from '@/lib/gather-time'
import { PUBLIC_IMAGE_URL_MAX_LENGTH } from '@/lib/public-image-url'
import { createSystemNotice } from '@/app/super-admin/actions'

const SUPER_ADMIN_TZ = 'Asia/Seoul'

// 시스템 공지는 글로벌(모든 테넌트 공통)이라 테넌트 타임존이 없다. 개발자
// 운영 기준인 KST 로 고정. 4분할 입력은 datetime-local 의 모바일/locale 차이를
// 피하려고 도입한 공통 컴포넌트와 동일.
export default function SystemNoticeForm() {
  const router = useRouter()
  const [parts, setParts] = useState<GatherTimeParts>(BLANK_GATHER_PARTS)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const allBlank = isAllBlank(parts)
  const parsed = allBlank ? null : parseGatherTime(parts, { timezone: SUPER_ADMIN_TZ })
  const preview = parsed ? formatGatherTimeKo(parsed, SUPER_ADMIN_TZ) : null

  async function handleSubmit(formData: FormData) {
    setError(null)
    if (allBlank) {
      setError('만료 시각은 필수입니다.')
      return
    }
    if (!parsed) {
      setError('월/일/시/분을 모두 채워 주세요.')
      return
    }
    if (parsed.getTime() <= Date.now()) {
      setError('만료 시각은 현재보다 뒤여야 합니다.')
      return
    }
    formData.set('expiresAt', parsed.toISOString())
    startTransition(async () => {
      try {
        await createSystemNotice(formData)
        const form = document.getElementById('system-notice-form') as HTMLFormElement | null
        form?.reset()
        setParts(BLANK_GATHER_PARTS)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'failed to create notice')
      }
    })
  }

  const previewClass = preview
    ? 'text-amber-300'
    : 'text-red-400'
  const previewText = preview
    ? `만료: ${preview} (KST)`
    : allBlank
      ? '만료 시각을 반드시 입력하세요.'
      : '월/일/시/분을 모두 채워 주세요.'

  return (
    <form id="system-notice-form" action={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 block mb-1">메시지</label>
        <textarea
          name="message"
          rows={3}
          placeholder="모든 테넌트에 표시될 메시지"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">목적</label>
          <select
            name="purpose"
            defaultValue="maintenance"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="incident">장애</option>
            <option value="maintenance">점검</option>
            <option value="security">보안</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">중요도</label>
          <select
            name="severity"
            defaultValue="critical"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="important">중요 · 사용자가 닫을 수 있음</option>
            <option value="critical">긴급 · 만료 전까지 닫을 수 없음</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">이미지 URL (선택)</label>
          <input
            type="url"
            name="imageUrl"
            maxLength={PUBLIC_IMAGE_URL_MAX_LENGTH}
            placeholder="https://..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">만료 시각 (KST, 필수)</label>
          <FourPartTimeInput
            parts={parts}
            onChange={setParts}
            labels={{ month: '월', day: '일', hour: '시', minute: '분' }}
            size="compact"
          />
          <p className={`text-[11px] mt-1 ${previewClass}`}>{previewText}</p>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold text-sm px-4 py-2 rounded-lg"
      >
        <Plus size={14} />
        {isPending ? '발행 중...' : '발행'}
      </button>
    </form>
  )
}
