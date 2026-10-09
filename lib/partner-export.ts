// Shared plumbing for the partner (CRM/ERP) export endpoints: pagination, incremental sync
// (`updated_since`), JSON / NDJSON / CSV output and institution student scoping.
import { apiError, authorizePartner, decodeCursor, encodeCursor, getPartnerDb, jsonNoStore, writePartnerAudit, type PartnerIntegration } from '@/lib/partner-integration-api'

import { csvCell, parseSince, toCsv, type ExportFormat } from '@/lib/partner-csv'

export const MAX_EXPORT_PAGE = 500
export { csvCell, parseSince, toCsv }

/** All active student user ids of an institution (PostgREST caps a page at 1000 rows). */
export async function institutionStudentIds(institutionId: string): Promise<string[]> {
  const db = getPartnerDb()
  const ids: string[] = []
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await db.from('institution_users').select('user_id')
      .eq('institution_id', institutionId).eq('role', 'student').or('is_active.is.null,is_active.eq.true')
      .order('user_id', { ascending: true }).range(from, from + 999)
    if (error) throw new Error('students_unavailable')
    ids.push(...(data ?? []).map((row: { user_id: string }) => row.user_id))
    if ((data?.length ?? 0) < 1000) break
  }
  return ids
}

export type ExportContext = {
  integration: PartnerIntegration
  db: ReturnType<typeof getPartnerDb>
  since: string | null
  limit: number
  offset: number
}

export type ExportResource = {
  name: string
  scope: string
  maxLimit?: number
  /** Returns up to limit+1 rows so the helper can tell whether another page exists. */
  fetch: (ctx: ExportContext) => Promise<Array<Record<string, unknown>>>
}

export async function runExport(request: Request, resource: ExportResource): Promise<Response> {
  const auth = await authorizePartner(request, resource.scope)
  if (auth.ok === false) return auth.response
  const endpoint = new URL(request.url).pathname
  const audit = (status: number) => writePartnerAudit(auth.integration, 'export:' + resource.name, endpoint, status, auth.requestId)
  const fail = async (code: string, message: string, status: number) => {
    if (!(await audit(status))) return apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', auth.requestId, 503)
    return apiError(code, message, auth.requestId, status)
  }

  const url = new URL(request.url)
  const requestedLimit = Number(url.searchParams.get('limit') ?? 100)
  const maxLimit = resource.maxLimit ?? MAX_EXPORT_PAGE
  const limit = Number.isInteger(requestedLimit) ? Math.min(maxLimit, Math.max(1, requestedLimit)) : Math.min(100, maxLimit)
  const offset = decodeCursor(auth.integration.pseudonym_key, url.searchParams.get('cursor'))
  if (offset === null) return fail('invalid_cursor', 'Sayfalama imleci geçersiz.', 422)
  const since = parseSince(url.searchParams.get('updated_since'))
  if (since === undefined) return fail('invalid_request', 'updated_since geçerli bir ISO tarih olmalı.', 422)
  const format = (url.searchParams.get('format') ?? 'json') as ExportFormat
  if (!['json', 'ndjson', 'csv'].includes(format)) return fail('invalid_request', 'format json, ndjson veya csv olmalı.', 422)

  let rows: Array<Record<string, unknown>>
  try {
    rows = await resource.fetch({ integration: auth.integration, db: getPartnerDb(), since, limit, offset })
  } catch {
    return fail('temporarily_unavailable', 'Veri şu anda alınamadı.', 503)
  }
  const page = rows.slice(0, limit)
  const nextCursor = rows.length > limit ? encodeCursor(auth.integration.pseudonym_key, offset + limit) : null
  if (!(await audit(200))) return apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', auth.requestId, 503)

  const headers: Record<string, string> = { 'X-Request-Id': auth.requestId }
  if (nextCursor) headers['X-Next-Cursor'] = nextCursor
  if (format === 'csv') return new Response(toCsv(page), { status: 200, headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store, private' } })
  if (format === 'ndjson') return new Response(page.map(row => JSON.stringify(row)).join('\n') + (page.length ? '\n' : ''), { status: 200, headers: { ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, private' } })
  return jsonNoStore({ data: page, next_cursor: nextCursor, request_id: auth.requestId })
}
