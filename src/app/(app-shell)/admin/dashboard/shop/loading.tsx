export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden="true">
      <div className="flex items-center justify-between gap-4">
        <div className="h-7 w-40 rounded bg-surface-2" />
        <div className="h-10 w-24 rounded-lg bg-surface-2" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-10 w-24 shrink-0 rounded-lg bg-surface" />
        ))}
      </div>
      <section className="space-y-3">
        <div className="space-y-2">
          <div className="h-5 w-36 rounded bg-surface-2" />
          <div className="h-4 w-64 max-w-full rounded bg-surface-2" />
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex min-h-20 items-center gap-3 px-4 py-3 sm:px-5">
              <div className="h-9 w-9 rounded-lg bg-surface-2" />
              <div className="grid flex-1 gap-2 sm:grid-cols-3">
                <div className="h-3 w-24 rounded bg-surface-2" />
                <div className="h-4 w-28 rounded bg-surface-2" />
                <div className="h-3 w-40 max-w-full rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
