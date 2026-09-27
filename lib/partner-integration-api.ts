import { createHmac, createHash, randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server-create-client'

export function getPartnerDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) throw new Error('Partner integration database configuration is unavailable.')
  return createClient(supabaseUrl, serviceKey)
}

export type PartnerIntegration = {
  id: string
  institution_id: string
  name: string
  pseudonym_key: string
  scopes: string[]
  expires_at: string | null
}

export type PartnerAuthResult =
  | { ok: true; integration: PartnerIntegration; requestId: string }
  | { ok: false; response: Response }

export function jsonNoStore(body: unknown, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Cache-Control', 'no-store, private')
  responseHeaders.set('Pragma', 'no-cache')
  return Response.json(body, { status, headers: responseHeaders })
}

export function apiError(code: string, message: string, requestId: string, status: number) {
  return jsonNoStore({ error: { code, message, request_id: requestId } }, status)
}

export function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function newPartnerSecret() {
  return 'ptn_live_' + randomBytes(32).toString('hex')
}

export function newPseudonymKey() {
  return randomBytes(32).toString('hex')
}

export function pseudonymFor(key: string, userId: string) {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(userId).digest('hex')
}

export function encodeCursor(key: string, offset: number) {
  const payload = Buffer.from(JSON.stringify({ offset })).toString('base64url')
  const signature = createHmac('sha256', Buffer.from(key, 'hex')).update(payload).digest('base64url')
  return payload + '.' + signature
}

export function decodeCursor(key: string, cursor: string | null) {
  if (!cursor) return 0
  if (cursor.length > 512) return null
  const [payload, signature, extra] = cursor.split('.')
  if (!payload || !signature || extra) return null
  const expected = createHmac('sha256', Buffer.from(key, 'hex')).update(payload).digest()
  const provided = Buffer.from(signature, 'base64url')
  if (provided.length !== expected.length || !expected.equals(provided)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!Number.isSafeInteger(parsed.offset) || parsed.offset < 0 || parsed.offset > 1_000_000) return null
    return parsed.offset as number
  } catch {
    return null
  }
}

export async function authorizePartner(request: Request, requiredScope: string): Promise<PartnerAuthResult> {
  const db = getPartnerDb()
  const requestId = randomUUID()
  const auth = request.headers.get('authorization')
  const rawToken = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!/^ptn_live_[a-f0-9]{64}$/.test(rawToken)) {
    return { ok: false, response: apiError('unauthorized', 'Geçerli entegrasyon kimliği gerekli.', requestId, 401) }
  }

  const { data: integration, error } = await db
    .from('partner_integrations')
    .select('id, institution_id, name, pseudonym_key, scopes, expires_at')
    .eq('token_hash', sha256(rawToken))
    .is('revoked_at', null)
    .maybeSingle()

  if (error || !integration || (integration.expires_at && new Date(integration.expires_at).getTime() <= Date.now())) {
    return { ok: false, response: apiError('unauthorized', 'Geçerli entegrasyon kimliği gerekli.', requestId, 401) }
  }
  if (!integration.scopes?.includes(requiredScope)) {
    const audited = await writePartnerAudit(integration, 'scope_denied:' + requiredScope, new URL(request.url).pathname, 403, requestId)
    if (!audited) {
      return { ok: false, response: apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', requestId, 503) }
    }
    return { ok: false, response: apiError('forbidden', 'Bu işlem için izin kapsamı yok.', requestId, 403) }
  }

  const { data: institution, error: institutionError } = await db
    .from('institutions')
    .select('active')
    .eq('id', integration.institution_id)
    .maybeSingle()
  if (institutionError) {
    return { ok: false, response: apiError('temporarily_unavailable', 'Kurum erişimi doğrulanamadı.', requestId, 503) }
  }
  if (!institution || institution.active === false) {
    const audited = await writePartnerAudit(integration, 'institution_inactive', new URL(request.url).pathname, 403, requestId)
    if (!audited) {
      return { ok: false, response: apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', requestId, 503) }
    }
    return { ok: false, response: apiError('forbidden', 'Kurum entegrasyon erişimine kapalı.', requestId, 403) }
  }

  const now = new Date()
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString()
  const { data: requestCount, error: rateError } = await db.rpc('consume_partner_integration_rate_limit', {
    p_integration_id: integration.id,
    p_window_start: windowStart,
  })
  if (rateError) {
    return { ok: false, response: apiError('temporarily_unavailable', 'İstek koruması şu anda kullanılamıyor.', requestId, 503) }
  }
  if (requestCount > 120) {
    const audited = await writePartnerAudit(integration, 'rate_limit_exceeded', new URL(request.url).pathname, 429, requestId)
    if (!audited) {
      return { ok: false, response: apiError('temporarily_unavailable', 'Denetim kaydı oluşturulamadı.', requestId, 503) }
    }
    return { ok: false, response: apiError('rate_limit_exceeded', 'Dakikalık istek sınırı aşıldı.', requestId, 429) }
  }
  return { ok: true, integration, requestId }
}

export async function writePartnerAudit(
  integration: PartnerIntegration,
  action: string,
  endpoint: string,
  statusCode: number,
  requestId: string,
) {
  const { error } = await getPartnerDb().from('partner_integration_audit').insert({
    integration_id: integration.id,
    institution_id: integration.institution_id,
    action,
    endpoint,
    status_code: statusCode,
    request_id: requestId,
  })
  return !error
}

