export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 animate-pulse space-y-6 px-4 py-6 sm:py-8">
      <div className="space-y-2">
        <div className="h-6 w-32 bg-gray-800 rounded" />
        <div className="h-4 w-56 bg-gray-800 rounded" />
      </div>
      <section className="overflow-hidden rounded-xl bg-surface ring-1 ring-border">
        <div className="min-h-20 space-y-2 px-4 py-4">
          <div className="h-3 w-28 rounded bg-surface-2" />
          <div className="h-4 w-64 max-w-full rounded bg-surface-2" />
        </div>
      </section>
      <section className="divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border sm:grid sm:grid-cols-2 sm:divide-y-0">
        {[0, 1].map((item) => (
          <div key={item} className="flex min-h-24 items-center gap-3 px-4 py-3 sm:border-r sm:border-border">
            <div className="h-10 w-10 rounded-lg bg-surface-2" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-20 rounded bg-surface-2" />
              <div className="h-6 w-28 rounded bg-surface-2" />
              <div className="h-3 w-36 max-w-full rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </section>
      <section className="space-y-3">
        <div className="h-5 w-32 bg-gray-800 rounded" />
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
          {[...Array(3)].map((_, i) => (
            <li key={i} className="h-16 px-4 py-3" />
          ))}
        </ul>
      </section>
    </main>
  )
}
