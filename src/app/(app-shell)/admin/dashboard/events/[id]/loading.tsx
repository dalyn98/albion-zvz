export default function Loading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-2 flex-1">
          <div className="h-6 w-56 bg-gray-800 rounded" />
          <div className="h-4 w-72 bg-gray-800 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 bg-gray-800 rounded" />
          <div className="h-8 w-20 bg-gray-800 rounded" />
        </div>
      </div>
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-1"
          >
            <div className="h-3 w-16 bg-gray-800 rounded" />
            <div className="h-6 w-20 bg-gray-800 rounded" />
          </div>
        ))}
      </section>
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="h-5 w-32 bg-gray-800 rounded" />
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2"
          >
            <div className="h-8 w-8 bg-gray-800 rounded-full" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-40 bg-gray-800 rounded" />
              <div className="h-3 w-24 bg-gray-800 rounded" />
            </div>
            <div className="h-4 w-16 bg-gray-800 rounded" />
          </div>
        ))}
      </section>
    </div>
  )
}
