export default function Loading() {
  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 w-32 bg-gray-800 rounded" />
        <div className="h-4 w-56 bg-gray-800 rounded" />
      </div>
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-3">
        <div className="h-3 w-20 bg-gray-800 rounded" />
        <div className="h-9 w-48 bg-gray-800 rounded" />
        <div className="h-3 w-56 bg-gray-800 rounded" />
      </section>
      <section className="space-y-3">
        <div className="h-5 w-28 bg-gray-800 rounded" />
        <div className="h-24 bg-gray-900 border border-gray-800 rounded-lg" />
      </section>
      <section className="space-y-3">
        <div className="h-5 w-32 bg-gray-800 rounded" />
        <ul className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <li key={i} className="bg-gray-900 border border-gray-800 rounded-lg h-16" />
          ))}
        </ul>
      </section>
    </main>
  )
}
