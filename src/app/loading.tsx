import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <main className="flex-1 flex items-center justify-center py-16">
      <Loader2 size={28} className="animate-spin text-amber-400" />
    </main>
  )
}
