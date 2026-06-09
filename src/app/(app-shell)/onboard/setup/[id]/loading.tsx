export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-5 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 bg-gray-800 rounded" />
        <div className="h-4 w-1 bg-gray-800 rounded" />
        <div className="h-4 w-24 bg-gray-800 rounded" />
      </div>
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="h-6 w-64 bg-gray-800 rounded" />
        <div className="h-4 w-full bg-gray-800 rounded" />
        <div className="h-4 w-3/4 bg-gray-800 rounded" />
        <div className="pt-3 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-gray-950 border border-gray-800 rounded-lg p-3"
            >
              <div className="h-8 w-8 bg-gray-800 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-36 bg-gray-800 rounded" />
                <div className="h-3 w-24 bg-gray-800 rounded" />
              </div>
              <div className="h-8 w-20 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
