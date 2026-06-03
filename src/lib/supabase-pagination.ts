export interface SupabasePageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export interface SupabasePagedQuery<T> {
  range: (from: number, to: number) => PromiseLike<SupabasePageResult<T>>
}

const DEFAULT_PAGE_SIZE = 1000

export async function selectPagedRows<T>(input: {
  label: string
  buildQuery: () => SupabasePagedQuery<T>
  pageSize?: number
}): Promise<{ rows: T[]; error?: string }> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await input.buildQuery().range(from, from + pageSize - 1)
    if (error) return { rows, error: `${input.label}: ${error.message}` }

    const page = data ?? []
    rows.push(...page)
    if (page.length < pageSize) return { rows }
  }
}

export async function selectPagedRowsOrThrow<T>(input: {
  label: string
  buildQuery: () => SupabasePagedQuery<T>
  pageSize?: number
}): Promise<T[]> {
  const result = await selectPagedRows(input)
  if (result.error) throw new Error(result.error)
  return result.rows
}
