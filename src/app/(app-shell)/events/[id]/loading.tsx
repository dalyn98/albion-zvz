export default function Loading() {
  return (
    <div className="flex-1 w-full max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 py-6 sm:py-8 flex flex-col lg:flex-row lg:items-start lg:gap-6 space-y-4 lg:space-y-0 animate-pulse">
      <main className="flex-1 min-w-0 space-y-6 sm:space-y-8">
        <div className="h-4 w-24 bg-gray-800 rounded" />
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="h-3 w-16 bg-gray-800 rounded" />
          <div className="h-6 w-2/3 bg-gray-800 rounded" />
          <div className="flex flex-wrap gap-4">
            <div className="h-4 w-32 bg-gray-800 rounded" />
            <div className="h-4 w-28 bg-gray-800 rounded" />
          </div>
        </div>
        {[0, 1].map((p) => (
          <section key={p} className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <div className="h-5 w-20 bg-gray-800 rounded" />
              <div className="h-4 w-16 bg-gray-800 rounded" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl h-28" />
              ))}
            </div>
          </section>
        ))}
      </main>
      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl h-96" />
      </aside>
    </div>
  )
}
