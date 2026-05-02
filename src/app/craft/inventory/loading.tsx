export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 bg-gray-800 rounded" />
        <div className="h-4 w-72 bg-gray-800 rounded" />
      </div>
      <div className="flex items-center justify-between">
        <div className="h-9 w-48 bg-gray-800 rounded-lg" />
        <div className="h-9 w-32 bg-gray-800 rounded-lg" />
      </div>
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2"
          >
            <div className="h-20 bg-gray-800 rounded-lg" />
            <div className="h-3 w-3/4 bg-gray-800 rounded" />
            <div className="h-3 w-1/2 bg-gray-800 rounded" />
          </div>
        ))}
      </section>
    </main>
  )
}
