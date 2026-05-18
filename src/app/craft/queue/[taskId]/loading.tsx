export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-5 animate-pulse">
      <div className="h-4 w-20 bg-gray-800 rounded" />
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2 flex-1">
            <div className="h-6 w-56 bg-gray-800 rounded" />
            <div className="h-4 w-40 bg-gray-800 rounded" />
          </div>
          <div className="h-6 w-20 bg-gray-800 rounded" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-16 bg-gray-800 rounded" />
              <div className="h-5 w-24 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </section>
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="h-5 w-32 bg-gray-800 rounded" />
        <div className="h-32 w-full bg-gray-800/50 rounded" />
      </section>
    </main>
  )
}
