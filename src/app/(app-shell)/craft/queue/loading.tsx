export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 bg-gray-800 rounded" />
        <div className="h-4 w-72 bg-gray-800 rounded" />
      </div>
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="h-5 w-32 bg-gray-800 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 bg-gray-800 rounded" />
              <div className="h-6 w-20 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3"
          >
            <div className="h-10 w-10 bg-gray-800 rounded" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-48 bg-gray-800 rounded" />
              <div className="h-3 w-32 bg-gray-800 rounded" />
            </div>
            <div className="h-9 w-20 bg-gray-800 rounded-lg" />
          </div>
        ))}
      </section>
    </main>
  )
}
