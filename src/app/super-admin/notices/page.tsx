import { Megaphone, Trash2, Plus } from 'lucide-react'
import { listAllSystemNotices } from '@/lib/super-admin-notices'
import { createSystemNotice, archiveSystemNotice } from '@/app/super-admin/actions'
import { formatDateTimeShort } from '@/lib/format-datetime'

export const dynamic = 'force-dynamic'

function noticeStatus(n: { expiresAt: string | null; archivedAt: string | null }): {
  label: string
  className: string
} {
  if (n.archivedAt)
    return { label: '아카이브', className: 'bg-gray-500/10 border-gray-500/30 text-gray-400' }
  if (n.expiresAt && new Date(n.expiresAt) < new Date())
    return { label: '만료', className: 'bg-gray-500/10 border-gray-500/30 text-gray-400' }
  return { label: '활성', className: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' }
}

export default async function SuperAdminNoticesPage() {
  const notices = await listAllSystemNotices()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">시스템 공지</h1>
        <p className="text-gray-400 text-sm mt-1">
          모든 테넌트의 모든 사용자 상단에 표시되는 글로벌 배너입니다.
        </p>
      </div>

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300 inline-flex items-center gap-2">
          <Plus size={14} /> 새 공지 작성
        </h2>
        <form action={createSystemNotice} className="space-y-3">
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
              <label className="text-xs text-gray-500 block mb-1">이미지 URL (선택)</label>
              <input
                type="url"
                name="imageUrl"
                placeholder="https://..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">만료 시각 (KST, 선택)</label>
              <input
                type="datetime-local"
                name="expiresAt"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
              />
            </div>
          </div>
          <button
            type="submit"
            className="bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm px-4 py-2 rounded-lg"
          >
            발행
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">공지 목록</h2>
        {notices.length === 0 ? (
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center text-gray-500 text-sm">
            아직 발행된 공지가 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {notices.map((n) => {
              const status = noticeStatus(n)
              return (
                <li
                  key={n.id}
                  className="bg-gray-900 border border-gray-700 rounded-2xl p-4 space-y-2"
                >
                  <div className="flex items-start gap-3">
                    <Megaphone size={14} className="text-amber-300 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border ${status.className}`}
                        >
                          {status.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDateTimeShort(n.createdAt)}
                        </span>
                        {n.expiresAt && (
                          <span className="text-xs text-gray-500">
                            만료: {formatDateTimeShort(n.expiresAt)}
                          </span>
                        )}
                      </div>
                      {n.message && (
                        <p className="text-sm text-amber-100 whitespace-pre-wrap break-words">
                          {n.message}
                        </p>
                      )}
                      {n.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={n.imageUrl}
                          alt=""
                          className="max-h-40 rounded-md border border-gray-800 mt-2"
                        />
                      )}
                    </div>
                    {!n.archivedAt && (
                      <form action={archiveSystemNotice}>
                        <input type="hidden" name="noticeId" value={n.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 text-rose-300 hover:text-rose-200 text-xs"
                        >
                          <Trash2 size={12} />
                          종료
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
