export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-4 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 bg-gray-800 rounded" />
        <div className="h-4 w-64 bg-gray-800 rounded" />
      </div>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl h-24" />
      <div className="flex gap-1 border-b border-gray-800">
        <div className="h-10 w-24 bg-gray-800 rounded-t" />
        <div className="h-10 w-24 bg-gray-900 rounded-t" />
      </div>
      <div className="h-11 bg-gray-900 border border-gray-800 rounded-lg" />
      <div className="flex gap-2">
        <div className="h-8 w-24 bg-gray-900 border border-gray-800 rounded-full" />
        <div className="h-8 w-24 bg-gray-900 border border-gray-800 rounded-full" />
      </div>
      <ul className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <li
            key={i}
            className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
          >
            <div className="w-9 h-9 rounded-full bg-gray-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-gray-800 rounded" />
              <div className="h-3 w-20 bg-gray-800 rounded" />
            </div>
            <div className="h-5 w-12 bg-gray-800 rounded" />
          </li>
        ))}
      </ul>
    </main>
  )
}
