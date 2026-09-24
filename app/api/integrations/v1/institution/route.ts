import { createHmac } from 'node:crypto'
import { apiError, authorizePartner, getPartnerDb, jsonNoStore, writePartnerAudit } from '@/lib/partner-integration-api'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await authorizePartner(request, 'institution:read')
  if (auth.ok === false) return auth.response

  const { data: institution, error } = await getPartnerDb()
    .from('institutions')
    .select('name')
    .eq('id', auth.integration.institution_id)
    .maybeSingle()
  if (error || !institution) {
    const audited = await writePartnerAudit(auth.integration, 'institution_read', '/api/integrations/v1/institution', 503, auth.requestId)
    if (!audited) return apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', auth.requestId, 503)
    return apiError('temporarily_unavailable', 'Kurum bilgisi alınamadı.', auth.requestId, 503)
  }

  const institutionRef = createHmac('sha256', Buffer.from(auth.integration.pseudonym_key, 'hex'))
    .update('institution:' + auth.integration.institution_id)
    .digest('hex')
  const audited = await writePartnerAudit(auth.integration, 'institution_read', '/api/integrations/v1/institution', 200, auth.requestId)
  if (!audited) return apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', auth.requestId, 503)
  return jsonNoStore({
    data: { institution_ref: institutionRef, name: institution.name },
    request_id: auth.requestId,
  })
}

