export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-pulse">
      <div className="h-4 w-24 bg-gray-800 rounded" />
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
        <div className="h-16 w-16 bg-gray-800 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 bg-gray-800 rounded" />
          <div className="h-4 w-32 bg-gray-800 rounded" />
        </div>
      </section>
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
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <div className="h-8 w-8 bg-gray-800 rounded" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-40 bg-gray-800 rounded" />
              <div className="h-3 w-24 bg-gray-800 rounded" />
            </div>
            <div className="h-4 w-16 bg-gray-800 rounded" />
          </div>
        ))}
      </section>
    </main>
  )
}
