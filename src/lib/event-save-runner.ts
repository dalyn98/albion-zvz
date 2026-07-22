export interface EventSectionSaveEntry {
  id: string
  label: string
  save: () => Promise<{ error?: string }>
}

export type EventSectionSaveReceipt =
  | { id: string; label: string; status: 'saved' }
  | { id: string; label: string; status: 'failed'; error: string }
  | { id: string; label: string; status: 'skipped' }

export async function runEventSectionSaves(
  entries: readonly EventSectionSaveEntry[],
): Promise<EventSectionSaveReceipt[]> {
  const receipts: EventSectionSaveReceipt[] = []
  let blocked = false

  for (const entry of entries) {
    if (blocked) {
      receipts.push({ id: entry.id, label: entry.label, status: 'skipped' })
      continue
    }

    try {
      const result = await entry.save()
      if (result.error) {
        receipts.push({
          id: entry.id,
          label: entry.label,
          status: 'failed',
          error: result.error,
        })
        blocked = true
      } else {
        receipts.push({ id: entry.id, label: entry.label, status: 'saved' })
      }
    } catch (error) {
      receipts.push({
        id: entry.id,
        label: entry.label,
        status: 'failed',
        error: error instanceof Error ? error.message : 'unknown error',
      })
      blocked = true
    }
  }

  return receipts
}
