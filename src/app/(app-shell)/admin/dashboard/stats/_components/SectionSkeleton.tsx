// 통계 섹션이 Suspense fallback 으로 사용. 텍스트 없이 순수 셰이프만 렌더해
// i18n 키 추가 없이 다국어 동등 유지. animate-pulse 로 로딩 인지 보장.
export default function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 animate-pulse space-y-3">
      <div className="h-5 w-48 bg-gray-700/60 rounded" />
      <div className="h-3 w-3/4 bg-gray-700/30 rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-gray-800/60 border border-gray-700/40 rounded-lg"
          />
        ))}
      </div>
      <div className="space-y-2 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-3 bg-gray-700/40 rounded" />
        ))}
      </div>
    </section>
  )
}
