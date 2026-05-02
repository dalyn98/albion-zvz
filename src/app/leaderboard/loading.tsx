export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-44 bg-gray-800 rounded" />
        <div className="h-4 w-72 bg-gray-800 rounded" />
      </div>
      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 w-28 bg-gray-800 rounded-t flex-shrink-0" />
        ))}
      </div>
      <section className="space-y-2">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3"
          >
            <div className="h-6 w-6 bg-gray-800 rounded" />
            <div className="h-8 w-8 bg-gray-800 rounded-full" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-40 bg-gray-800 rounded" />
              <div className="h-3 w-24 bg-gray-800 rounded" />
            </div>
            <div className="h-5 w-16 bg-gray-800 rounded" />
          </div>
        ))}
      </section>
    </main>
  )
}
