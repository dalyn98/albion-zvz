export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-36 rounded bg-gray-800" />
        <div className="h-4 w-72 max-w-full rounded bg-gray-800" />
      </div>
      <div className="flex gap-1 overflow-hidden border-b border-gray-800">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-28 shrink-0 rounded-t bg-gray-900"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-24 rounded-full bg-gray-800" />
        <div className="h-8 w-20 rounded-full bg-gray-900" />
        <div className="h-8 w-24 rounded-full bg-gray-900" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-800 bg-gray-900 p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 rounded bg-gray-800" />
                <div className="h-3 w-64 max-w-full rounded bg-gray-800" />
              </div>
              <div className="h-8 w-20 rounded-lg bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
