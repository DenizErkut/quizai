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

type OrderBuilder = {
  order(column: string, options?: { ascending?: boolean }): OrderBuilder
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
}
type RowOf<B> = B extends { range(...args: never[]): PromiseLike<{ data: (infer R)[] | null }> } ? R : never

/**
 * Drop-in replacement for `await query.limit(n)` when n may exceed the API's Max rows.
 * `build` must return a FRESH filtered select each call (no order/limit); `orderBy` must make the
 * order total (default: id), otherwise pages may skip or repeat rows. Never throws: errors come back
 * in `error`, like a normal Supabase response, so call sites keep their existing error handling.
 */
export async function readAll<B extends OrderBuilder>(
  build: () => B, orderBy: string | string[] = 'id', options: { pageSize?: number; maxRows?: number } = {},
): Promise<{ data: RowOf<B>[]; error: { message: string } | null }> {
  const columns = Array.isArray(orderBy) ? orderBy : [orderBy]
  try {
    const data = await fetchAllRows<RowOf<B>>((from, to) => {
      let query: OrderBuilder = build()
      for (const column of columns) query = query.order(column)
      return query.range(from, to) as PromiseLike<{ data: RowOf<B>[] | null; error: { message: string } | null }>
    }, options)
    return { data, error: null }
  } catch (error) {
    return { data: [], error: { message: error instanceof Error ? error.message : 'readAll failed' } }
  }
}
