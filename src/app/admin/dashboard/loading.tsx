export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-1 border-b border-gray-800">
        <div className="h-10 w-24 bg-gray-800 rounded-t" />
        <div className="h-10 w-24 bg-gray-900 rounded-t" />
      </div>
      <div className="h-11 bg-gray-900 border border-gray-800 rounded-lg" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
          >
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-gray-800 rounded" />
              <div className="h-3 w-56 bg-gray-800 rounded" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 w-20 bg-gray-800 rounded-lg" />
              <div className="h-8 w-8 bg-gray-800 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
