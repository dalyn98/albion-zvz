export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-32 bg-gray-800 rounded" />
        <div className="h-4 w-64 bg-gray-800 rounded" />
      </div>
      <section className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-56 bg-gray-800 rounded" />
              <div className="h-4 w-24 bg-gray-800 rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-20 bg-gray-800 rounded" />
              <div className="h-6 w-20 bg-gray-800 rounded" />
              <div className="h-6 w-20 bg-gray-800 rounded" />
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}
