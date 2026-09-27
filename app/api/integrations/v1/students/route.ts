import { apiError, authorizePartner, decodeCursor, encodeCursor, getPartnerDb, jsonNoStore, pseudonymFor, writePartnerAudit } from '@/lib/partner-integration-api'

export const runtime = 'nodejs'
const MAX_PAGE_SIZE = 100

export async function GET(request: Request) {
  const auth = await authorizePartner(request, 'students:read:pseudonymous')
  if (auth.ok === false) return auth.response
  const partnerDb = getPartnerDb()

  const url = new URL(request.url)
  const requestedLimit = Number(url.searchParams.get('limit') ?? 50)
  const limit = Number.isInteger(requestedLimit) ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedLimit)) : 50
  const offset = decodeCursor(auth.integration.pseudonym_key, url.searchParams.get('cursor'))
  if (offset === null) return apiError('invalid_cursor', 'Sayfalama imleci geçersiz.', auth.requestId, 422)

  const { data: members, error: memberError } = await partnerDb
    .from('institution_users')
    .select('user_id, joined_at')
    .eq('institution_id', auth.integration.institution_id)
    .eq('role', 'student')
    .order('user_id', { ascending: true })
    .range(offset, offset + limit)

  if (memberError) {
    const audited = await writePartnerAudit(auth.integration, 'students_read', '/api/integrations/v1/students', 503, auth.requestId)
    if (!audited) return apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', auth.requestId, 503)
    return apiError('temporarily_unavailable', 'Öğrenci listesi alınamadı.', auth.requestId, 503)
  }

  const page = (members ?? []).slice(0, limit)
  const hasMore = (members?.length ?? 0) > limit
  const ids = page.map((member: { user_id: string }) => member.user_id)
  const { data: profiles, error: profileError } = ids.length
    ? await partnerDb.from('profiles').select('id, grade').in('id', ids)
    : { data: [], error: null }
  if (profileError) {
    const audited = await writePartnerAudit(auth.integration, 'students_read', '/api/integrations/v1/students', 503, auth.requestId)
    if (!audited) return apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', auth.requestId, 503)
    return apiError('temporarily_unavailable', 'Öğrenci profilleri alınamadı.', auth.requestId, 503)
  }
  const gradeById = new Map((profiles ?? []).map((profile: { id: string; grade: number | null }) => [profile.id, profile.grade]))
  const data = page.map((member: { user_id: string; joined_at: string | null }) => ({
    student_ref: pseudonymFor(auth.integration.pseudonym_key, member.user_id),
    grade: gradeById.get(member.user_id) ?? null,
    status: 'active',
    membership_since: member.joined_at,
  }))

  const audited = await writePartnerAudit(auth.integration, 'students_read', '/api/integrations/v1/students', 200, auth.requestId)
  if (!audited) return apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', auth.requestId, 503)
  return jsonNoStore({
    data,
    next_cursor: hasMore ? encodeCursor(auth.integration.pseudonym_key, offset + limit) : null,
    request_id: auth.requestId,
  })
}

