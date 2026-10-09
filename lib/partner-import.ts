// Write-side of the partner (CRM/ERP) API: school grades and external-id links.
import { apiError, authorizePartner, getPartnerDb, jsonNoStore, writePartnerAudit } from '@/lib/partner-integration-api'
import { commitGradeImport } from '@/lib/grades-import'
import { resolveStudents, type StudentLocator } from '@/lib/partner-resources'

const MAX_BODY_CHARS = 2_000_000
const MAX_GRADE_ROWS = 1000
const MAX_SUBJECTS = 40
const MAX_LINKS = 500

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_CHARS) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch { return null }
}

async function guarded(request: Request, scope: string, action: string, run: (ctx: { integration: Awaited<ReturnType<typeof authorizePartner>> extends infer A ? A extends { ok: true; integration: infer I } ? I : never : never; requestId: string; body: Record<string, unknown> }) => Promise<{ status: number; body: unknown }>): Promise<Response> {
  const auth = await authorizePartner(request, scope)
  if (auth.ok === false) return auth.response
  const endpoint = new URL(request.url).pathname
  const finish = async (status: number, payload: unknown) => {
    if (!(await writePartnerAudit(auth.integration, action, endpoint, status, auth.requestId))) {
      return apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', auth.requestId, 503)
    }
    return jsonNoStore(payload, status)
  }
  const body = await readJson(request)
  if (!body) return finish(400, { error: { code: 'invalid_request', message: 'Geçerli JSON gövdesi gerekli (en fazla ~2 MB).', request_id: auth.requestId } })
  try {
    const result = await run({ integration: auth.integration, requestId: auth.requestId, body })
    return finish(result.status, result.body)
  } catch {
    return finish(503, { error: { code: 'temporarily_unavailable', message: 'İşlem tamamlanamadı.', request_id: auth.requestId } })
  }
}

const err = (code: string, message: string, requestId: string, status: number) => ({ status, body: { error: { code, message, request_id: requestId } } })

/** POST /grades — idempotent per label: reusing a label is rejected so retries never double-import. */
export function importGrades(request: Request) {
  return guarded(request, 'grades:write', 'import:grades', async ({ integration, requestId, body }) => {
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : []
    if (label.length < 2 || label.length > 120) return err('invalid_request', 'label 2-120 karakter olmalı.', requestId, 422)
    if (!rows.length || rows.length > MAX_GRADE_ROWS) return err('invalid_request', `rows 1-${MAX_GRADE_ROWS} satır olmalı.`, requestId, 422)
    const db = getPartnerDb()
    const { data: existing } = await db.from('grade_imports').select('id').eq('institution_id', integration.institution_id).eq('label', label).limit(1)
    if (existing?.length) return err('duplicate_label', 'Bu etiketle bir aktarım zaten var; yeni bir etiket kullanın.', requestId, 409)

    const resolved = await resolveStudents(db, integration.institution_id, rows as StudentLocator[])
    const accepted: Array<{ studentId: string; subjects: Record<string, string> }> = []
    const rejected: Array<{ index: number; reason: string }> = []
    rows.forEach((row, index) => {
      const subjects = row.subjects && typeof row.subjects === 'object' && !Array.isArray(row.subjects) ? (row.subjects as Record<string, unknown>) : null
      const entries = subjects ? Object.entries(subjects) : []
      if (!subjects || !entries.length || entries.length > MAX_SUBJECTS || entries.some(([name, value]) => !name.trim() || name.length > 80 || !['string', 'number'].includes(typeof value) || String(value).length > 20)) {
        rejected.push({ index, reason: 'invalid_subjects' }); return
      }
      const resolution = resolved[index]
      if (!resolution.userId) { rejected.push({ index, reason: resolution.reason || 'unresolved' }); return }
      accepted.push({ studentId: resolution.userId, subjects: Object.fromEntries(entries.map(([name, value]) => [name.trim(), String(value)])) })
    })
    if (body.strict === true && rejected.length) return { status: 422, body: { error: { code: 'unresolved_rows', message: 'Bazı satırlar eşleşmedi; strict modda hiçbir şey aktarılmadı.', request_id: requestId }, rejected } }
    if (!accepted.length) return { status: 422, body: { error: { code: 'unresolved_rows', message: 'Eşleşen satır yok.', request_id: requestId }, rejected } }
    const result = await commitGradeImport({ scope: 'institution', institutionId: integration.institution_id, uploadedBy: integration.created_by, label, sourceFilename: 'partner-api:' + integration.name, rows: accepted })
    return { status: 201, body: { data: { import_id: result.importId, received: rows.length, imported_rows: accepted.length, grades_inserted: result.gradesInserted, rejected }, request_id: requestId } }
  })
}

/** POST /links — map a CRM/ERP record id to a Pratium student (upsert per system + student). */
export function upsertLinks(request: Request) {
  return guarded(request, 'students:link', 'import:links', async ({ integration, requestId, body }) => {
    const system = typeof body.system === 'string' ? body.system.trim().toLowerCase() : ''
    const links = Array.isArray(body.links) ? (body.links as Array<Record<string, unknown>>) : []
    if (!/^[a-z0-9_.-]{2,40}$/.test(system)) return err('invalid_request', 'system 2-40 karakter (a-z, 0-9, _ . -) olmalı.', requestId, 422)
    if (!links.length || links.length > MAX_LINKS) return err('invalid_request', `links 1-${MAX_LINKS} kayıt olmalı.`, requestId, 422)
    const db = getPartnerDb()
    const resolved = await resolveStudents(db, integration.institution_id, links as StudentLocator[])
    const rejected: Array<{ index: number; reason: string }> = []
    const wanted = new Map<string, { student_id: string; external_id: string }>() // by external id
    links.forEach((link, index) => {
      const externalId = typeof link.external_id === 'string' ? link.external_id.trim() : ''
      if (!externalId || externalId.length > 120) { rejected.push({ index, reason: 'invalid_external_id' }); return }
      const resolution = resolved[index]
      if (!resolution.userId) { rejected.push({ index, reason: resolution.reason || 'unresolved' }); return }
      if (wanted.has(externalId)) { rejected.push({ index, reason: 'duplicate_external_id_in_request' }); return }
      wanted.set(externalId, { student_id: resolution.userId, external_id: externalId })
    })
    const externalIds = [...wanted.keys()]
    const taken = new Map<string, string>()
    for (let i = 0; i < externalIds.length; i += 100) {
      const { data } = await db.from('partner_external_links').select('student_id, external_id').eq('institution_id', integration.institution_id).eq('system', system).in('external_id', externalIds.slice(i, i + 100))
      for (const row of (data ?? []) as Array<{ student_id: string; external_id: string }>) taken.set(row.external_id, row.student_id)
    }
    const toWrite: Array<Record<string, unknown>> = []
    const seenStudents = new Set<string>()
    for (const [externalId, entry] of wanted) {
      const owner = taken.get(externalId)
      if (owner && owner !== entry.student_id) { rejected.push({ index: links.findIndex(l => String(l.external_id).trim() === externalId), reason: 'external_id_belongs_to_other_student' }); continue }
      if (seenStudents.has(entry.student_id)) { rejected.push({ index: links.findIndex(l => String(l.external_id).trim() === externalId), reason: 'student_listed_twice' }); continue }
      seenStudents.add(entry.student_id)
      toWrite.push({ institution_id: integration.institution_id, system, student_id: entry.student_id, external_id: externalId, created_by_integration: integration.id, updated_at: new Date().toISOString() })
    }
    if (toWrite.length) {
      const { error } = await db.from('partner_external_links').upsert(toWrite, { onConflict: 'institution_id,system,student_id' })
      if (error) return err('conflict', 'Bağlantılar yazılamadı (çakışma).', requestId, 409)
    }
    return { status: 200, body: { data: { received: links.length, linked: toWrite.length, rejected }, request_id: requestId } }
  })
}
