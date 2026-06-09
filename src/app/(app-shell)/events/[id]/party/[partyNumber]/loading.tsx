export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-pulse">
      <div className="h-4 w-32 bg-gray-800 rounded" />
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="h-6 w-48 bg-gray-800 rounded" />
        <div className="h-4 w-64 bg-gray-800 rounded" />
      </section>
      <section className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3"
          >
            <div className="h-10 w-10 bg-gray-800 rounded-full" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-40 bg-gray-800 rounded" />
              <div className="h-3 w-28 bg-gray-800 rounded" />
            </div>
            <div className="flex gap-1">
              {[...Array(6)].map((_, j) => (
                <div key={j} className="h-8 w-8 bg-gray-800 rounded" />
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}
