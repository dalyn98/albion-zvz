export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-5 animate-pulse">
      <div className="h-4 w-20 bg-gray-800 rounded" />
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="h-6 w-64 bg-gray-800 rounded" />
        <div className="h-4 w-40 bg-gray-800 rounded" />
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="space-y-1">
            <div className="h-3 w-16 bg-gray-800 rounded" />
            <div className="h-5 w-28 bg-gray-800 rounded" />
          </div>
          <div className="space-y-1">
            <div className="h-3 w-16 bg-gray-800 rounded" />
            <div className="h-5 w-28 bg-gray-800 rounded" />
          </div>
        </div>
      </section>
      <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="h-5 w-32 bg-gray-800 rounded" />
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2"
          >
            <div className="h-10 w-10 bg-gray-800 rounded" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-44 bg-gray-800 rounded" />
              <div className="h-3 w-24 bg-gray-800 rounded" />
            </div>
            <div className="h-5 w-20 bg-gray-800 rounded" />
          </div>
        ))}
      </section>
    </main>
  )
}
