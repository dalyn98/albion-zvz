export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-2">
          <div className="h-6 w-56 bg-gray-800 rounded" />
          <div className="h-4 w-72 bg-gray-800 rounded" />
        </div>
        <div className="h-9 w-28 bg-gray-800 rounded" />
      </div>
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="h-5 w-40 bg-gray-800 rounded" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-24 bg-gray-800 rounded" />
              <div className="h-9 w-full bg-gray-800/60 rounded" />
            </div>
          ))}
        </div>
      </section>
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="h-5 w-32 bg-gray-800 rounded" />
        <div className="h-24 w-full bg-gray-800/50 rounded" />
      </section>
    </div>
  )
}
