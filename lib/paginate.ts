// Supabase/PostgREST caps every response at the project's "Max rows" setting
// (1000 in production), no matter what `.limit(n)` says. Reads that must see a
// whole table go through this helper. The caller supplies a stable, unique
// ORDER BY inside `page`, otherwise ranges may skip or repeat rows.
type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PageResult<T>,
  options: { pageSize?: number; maxRows?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 1000
  const maxRows = options.maxRows ?? 200_000
  const rows: T[] = []
  // Advance by what the server actually returned, so a lower server cap still terminates correctly.
  for (let from = 0; from < maxRows;) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    if (batch.length === 0) return rows
    rows.push(...batch)
    from += batch.length
  }
  throw new Error(`fetchAllRows: more than ${maxRows} rows`)
}
