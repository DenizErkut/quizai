import { NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server-create-client'
import {
  apiError,
  jsonNoStore,
  newPartnerSecret,
  newPseudonymKey,
  getPartnerDb,
  sha256,
} from '@/lib/partner-integration-api'

export const runtime = 'nodejs'

const allowedScopes = new Set(['institution:read', 'students:read:pseudonymous'])

async function getInstitutionAdmin(req: NextRequest) {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: 'Bearer ' + token } } },
  )
  const { data: { user } } = await userClient.auth.getUser()
  return user ?? null
}

export async function POST(req: NextRequest) {
  const partnerDb = getPartnerDb()
  const requestId = randomUUID()
  const user = await getInstitutionAdmin(req)
  if (!user) return apiError('unauthorized', 'Oturum açmış kurum yöneticisi gerekli.', requestId, 401)

  let body: { institutionId?: unknown; name?: unknown; scopes?: unknown; expiresAt?: unknown }
  try {
    const raw = await req.text()
    if (raw.length > 16_384) return apiError('payload_too_large', 'İstek gövdesi çok büyük.', requestId, 413)
    body = JSON.parse(raw)
  } catch {
    return apiError('invalid_request', 'Geçerli JSON gövdesi gerekli.', requestId, 400)
  }
  if (
    typeof body.institutionId !== 'string' ||
    typeof body.name !== 'string' ||
    body.name.trim().length < 2 ||
    body.name.trim().length > 100 ||
    !Array.isArray(body.scopes) ||
    body.scopes.length < 1 ||
    body.scopes.some(scope => typeof scope !== 'string' || !allowedScopes.has(scope)) ||
    new Set(body.scopes).size !== body.scopes.length
  ) {
    return apiError('invalid_request', 'Kurum, ad veya izin kapsamı geçersiz.', requestId, 422)
  }

  let expiresAt = new Date(Date.now() + 90 * 86400_000).toISOString()
  if (body.expiresAt !== undefined) {
    if (typeof body.expiresAt !== 'string') return apiError('invalid_request', 'Bitiş tarihi geçersiz.', requestId, 422)
    const parsed = new Date(body.expiresAt)
    if (!Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now() || parsed.getTime() > Date.now() + 366 * 86400_000) {
      return apiError('invalid_request', 'Bitiş tarihi bugün ile 1 yıl arasında olmalıdır.', requestId, 422)
    }
    expiresAt = parsed.toISOString()
  }

  const { data: membership, error: membershipError } = await partnerDb
    .from('institution_users')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('institution_id', body.institutionId)
    .eq('role', 'admin')
    .maybeSingle()
  if (membershipError || !membership) return apiError('forbidden', 'Bu kurumda yönetici yetkiniz yok.', requestId, 403)
  const { data: institution, error: institutionError } = await partnerDb
    .from('institutions')
    .select('active')
    .eq('id', membership.institution_id)
    .maybeSingle()
  if (institutionError || !institution || institution.active === false) {
    return apiError('forbidden', 'Etkin bir kurum için entegrasyon oluşturulabilir.', requestId, 403)
  }

  const secret = newPartnerSecret()
  const { data: created, error: createError } = await partnerDb
    .from('partner_integrations')
    .insert({
      institution_id: membership.institution_id,
      name: body.name.trim(),
      token_hash: sha256(secret),
      pseudonym_key: newPseudonymKey(),
      scopes: body.scopes,
      created_by: user.id,
      expires_at: expiresAt,
    })
    .select('id, name, institution_id, scopes, created_at, expires_at')
    .single()

  if (createError || !created) return apiError('temporarily_unavailable', 'Entegrasyon oluşturulamadı.', requestId, 503)
  const { error: auditError } = await partnerDb.from('partner_integration_audit').insert({
    integration_id: created.id,
    institution_id: created.institution_id,
    action: 'credential_created',
    endpoint: '/api/institution/integrations',
    status_code: 201,
    request_id: requestId,
  })
  if (auditError) {
    await partnerDb.from('partner_integrations').update({ revoked_at: new Date().toISOString() }).eq('id', created.id)
    return apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı; anahtar iptal edildi.', requestId, 503)
  }
  return jsonNoStore({ data: created, secret, warning: 'Bu anahtar yalnızca şimdi gösterilir; güvenli bir yerde saklayın.' }, 201)
}

export async function GET(req: NextRequest) {
  const partnerDb = getPartnerDb()
  const requestId = randomUUID()
  const user = await getInstitutionAdmin(req)
  if (!user) return apiError('unauthorized', 'Oturum açmış kurum yöneticisi gerekli.', requestId, 401)
  const institutionId = req.nextUrl.searchParams.get('institutionId') || ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(institutionId)) {
    return apiError('invalid_request', 'Kurum kimliği geçersiz.', requestId, 422)
  }
  const { data: membership } = await partnerDb
    .from('institution_users')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('institution_id', institutionId)
    .eq('role', 'admin')
    .maybeSingle()
  if (!membership) return apiError('forbidden', 'Bu kurumda yönetici yetkiniz yok.', requestId, 403)
  const { data, error } = await partnerDb
    .from('partner_integrations')
    .select('id, name, institution_id, scopes, created_at, expires_at, revoked_at')
    .eq('institution_id', membership.institution_id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return apiError('temporarily_unavailable', 'Entegrasyonlar alınamadı.', requestId, 503)
  const now = Date.now()
  return jsonNoStore({
    data: (data ?? []).map(item => ({
      ...item,
      is_expired: Boolean(item.expires_at && new Date(item.expires_at).getTime() <= now),
    })),
    request_id: requestId,
  })
}

export async function DELETE(req: NextRequest) {
  const partnerDb = getPartnerDb()
  const requestId = randomUUID()
  const user = await getInstitutionAdmin(req)
  if (!user) return apiError('unauthorized', 'Oturum açmış kurum yöneticisi gerekli.', requestId, 401)

  let body: { institutionId?: unknown; integrationId?: unknown }
  try {
    const raw = await req.text()
    if (raw.length > 16_384) return apiError('payload_too_large', 'İstek gövdesi çok büyük.', requestId, 413)
    body = JSON.parse(raw)
  } catch {
    return apiError('invalid_request', 'Geçerli JSON gövdesi gerekli.', requestId, 400)
  }
  if (typeof body.institutionId !== 'string' || typeof body.integrationId !== 'string') {
    return apiError('invalid_request', 'Kurum ve entegrasyon kimliği gerekli.', requestId, 422)
  }
  const { data: membership } = await partnerDb
    .from('institution_users')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('institution_id', body.institutionId)
    .eq('role', 'admin')
    .maybeSingle()
  if (!membership) return apiError('forbidden', 'Bu kurumda yönetici yetkiniz yok.', requestId, 403)

  const { data: revoked, error } = await partnerDb
    .from('partner_integrations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', body.integrationId)
    .eq('institution_id', membership.institution_id)
    .is('revoked_at', null)
    .select('id, name')
    .maybeSingle()
  if (error) return apiError('temporarily_unavailable', 'Entegrasyon iptal edilemedi.', requestId, 503)
  if (!revoked) return apiError('not_found', 'Entegrasyon bulunamadı.', requestId, 404)

  await partnerDb.from('partner_integration_audit').insert({
    integration_id: revoked.id,
    institution_id: membership.institution_id,
    action: 'credential_revoked',
    endpoint: '/api/institution/integrations',
    status_code: 200,
    request_id: requestId,
  })
  return jsonNoStore({ data: { id: revoked.id, revoked: true }, request_id: requestId })
}

