import Link from 'next/link'
import { CalendarRange, ExternalLink, RefreshCw } from 'lucide-react'
import {
  rebuildPublicZvzSeasonSnapshots,
  savePublicZvzSeason,
} from '@/app/super-admin/actions'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import { loadPublicZvzSeasonAdminOverview } from '@/lib/public-zvz-seasons'

export const dynamic = 'force-dynamic'

const SERVERS: AlbionServer[] = ['west', 'europe', 'east']

function formatUtcDate(value: string | null): string {
  return value ?? '없음'
}

function utcDateTimeInputValue(value: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 16) : ''
}

function formatUtcBoundary(value: string | null): string {
  return value ? `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '없음'
}

export default async function SuperAdminZvzSeasonsPage() {
  const seasons = await loadPublicZvzSeasonAdminOverview()

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <CalendarRange size={22} className="text-sky-300" />
            AGM Battles 시즌
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-400">
            Albion 서버별 공식 시즌 시작·종료 시각을 UTC로 입력합니다. 다음 시즌이 더 일찍 시작하면 그 시각을 이전 시즌의 종료 경계로 사용합니다.
          </p>
        </div>
        <Link
          href="/public/zvz-battles"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-2 text-xs font-semibold text-gray-200 hover:border-sky-400 hover:text-sky-200"
        >
          공개 순위 확인
          <ExternalLink size={13} />
        </Link>
      </header>

      <section className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 text-xs leading-relaxed text-sky-100/80">
        순위는 시즌 시작일부터 선택한 UTC 날짜까지 누적 계산됩니다. 최근 48시간의 일별 스냅샷은 로그 보정에 따라 갱신되고, 그보다 오래된 스냅샷은 자동 갱신에서 제외됩니다. 경계를 수정하면 같은 서버의 파생 스냅샷을 전부 다시 계산합니다.
      </section>

      <section className="rounded-2xl border border-gray-700 bg-gray-900 p-4">
        <h2 className="text-base font-semibold text-white">새 시즌 등록</h2>
        <form action={savePublicZvzSeason} className="mt-4 grid gap-3 md:grid-cols-[120px_1fr_190px_190px_auto]">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-400">Albion 서버</span>
            <select
              name="server"
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
            >
              {SERVERS.map((server) => (
                <option key={server} value={server}>{server}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-400">표시 이름</span>
            <input
              name="name"
              required
              maxLength={80}
              placeholder="예: Albion Season 29"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-400">시작 시각 (UTC)</span>
            <input
              name="startsAt"
              type="datetime-local"
              step={60}
              required
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-400">종료 시각 (UTC, 선택)</span>
            <input
              name="endsAt"
              type="datetime-local"
              step={60}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="submit"
            className="self-end rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-white hover:bg-sky-400"
          >
            등록 및 계산
          </button>
        </form>
      </section>

      {SERVERS.map((server) => {
        const serverSeasons = seasons.filter((season) => season.server === server)
        return (
          <section key={server} className="space-y-3 rounded-2xl border border-gray-700 bg-gray-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold uppercase text-white">{server}</h2>
                <p className="text-xs text-gray-500">등록 시즌 {serverSeasons.length}개</p>
              </div>
              <form action={rebuildPublicZvzSeasonSnapshots} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="server" value={server} />
                <label className="space-y-1">
                  <span className="block text-[10px] font-medium text-rose-200">확인 문구</span>
                  <input
                    name="confirmation"
                    required
                    placeholder="REBUILD"
                    className="w-28 rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-2 font-mono text-xs text-white placeholder:text-gray-600"
                  />
                </label>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/10"
                >
                  <RefreshCw size={13} />
                  전체 재계산
                </button>
              </form>
            </div>

            {serverSeasons.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-700 p-5 text-center text-sm text-gray-500">
                등록된 시즌이 없습니다. 등록 전까지 공개 화면은 기존 주간 순위를 유지합니다.
              </p>
            ) : (
              <div className="space-y-3">
                {serverSeasons.map((season) => (
                  <article key={season.id} className="rounded-xl border border-gray-800 bg-gray-950/50 p-3">
                    <form action={savePublicZvzSeason} className="grid gap-3 lg:grid-cols-[1fr_190px_190px_1fr_auto]">
                      <input type="hidden" name="seasonId" value={season.id} />
                      <input type="hidden" name="server" value={server} />
                      <label className="space-y-1">
                        <span className="text-[10px] font-medium text-gray-500">표시 이름</span>
                        <input
                          name="name"
                          required
                          maxLength={80}
                          defaultValue={season.name}
                          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-medium text-gray-500">시작 시각 (UTC)</span>
                        <input
                          name="startsAt"
                          type="datetime-local"
                          step={60}
                          required
                          defaultValue={utcDateTimeInputValue(season.startsAt)}
                          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-medium text-gray-500">종료 시각 (UTC)</span>
                        <input
                          name="endsAt"
                          type="datetime-local"
                          step={60}
                          defaultValue={utcDateTimeInputValue(season.endsAt)}
                          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-medium text-rose-200">수정 확인 문구</span>
                        <input
                          name="confirmation"
                          required
                          placeholder="UPDATE"
                          className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-xs text-white placeholder:text-gray-600"
                        />
                      </label>
                      <button
                        type="submit"
                        className="self-end rounded-lg border border-amber-500/40 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/10"
                      >
                        저장
                      </button>
                    </form>
                    <dl className="mt-3 grid gap-2 border-t border-gray-800 pt-3 text-[11px] text-gray-500 sm:grid-cols-2 xl:grid-cols-6">
                      <div><dt>정확한 시작</dt><dd className="mt-0.5 text-gray-300">{formatUtcBoundary(season.startsAt)}</dd></div>
                      <div><dt>종료 경계</dt><dd className="mt-0.5 text-gray-300">{formatUtcBoundary(season.endsAt)}</dd></div>
                      <div><dt>스냅샷</dt><dd className="mt-0.5 text-gray-300">{season.snapshotCount}일</dd></div>
                      <div><dt>확정 스냅샷</dt><dd className="mt-0.5 text-gray-300">{season.finalSnapshotCount}일</dd></div>
                      <div><dt>최근 기준일</dt><dd className="mt-0.5 text-gray-300">{formatUtcDate(season.latestSnapshotDate)}</dd></div>
                      <div><dt>최근 길드 수</dt><dd className="mt-0.5 text-gray-300">{season.latestGuildCount}</dd></div>
                      <div><dt>최근 연합 수</dt><dd className="mt-0.5 text-gray-300">{season.latestAllianceCount}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
