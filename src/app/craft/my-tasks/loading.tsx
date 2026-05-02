export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 bg-gray-800 rounded" />
        <div className="h-4 w-64 bg-gray-800 rounded" />
      </div>
      <section className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-4"
          >
            <div className="h-12 w-12 bg-gray-800 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-56 bg-gray-800 rounded" />
              <div className="h-3 w-40 bg-gray-800 rounded" />
              <div className="h-3 w-32 bg-gray-800 rounded" />
            </div>
            <div className="h-9 w-24 bg-gray-800 rounded-lg" />
          </div>
        ))}
      </section>
    </main>
  )
}
