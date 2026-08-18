// lib/identity/client.ts
// TR-PG bağlantı katmanı — kimlik verileri BU İSTEMCİ ÜZERİNDEN okunur/yazılır.
// Supabase client'ı kimlik verisi (ad, e-posta, yaş, veli bilgisi) için ASLA kullanılmaz.

import { Pool } from 'pg'

// TR-PG bağlantı havuzu (VPS'teki Postgres)
const trPool = new Pool({
  connectionString: process.env.TR_IDENTITY_DB_URL, // örn: postgresql://user:pass@tr-vps-ip:5432/pratium_identity
  ssl: process.env.TR_IDENTITY_DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
})

export interface Identity {
  id: string
  supabase_user_id: string
  full_name: string
  email: string
  age: number | null
  role: 'student' | 'teacher' | 'parent' | 'institution_admin'
  parent_email: string | null
  parent_verified: boolean
  institution_name: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

// Kimlik oluştur (kayıt sırasında)
export async function createIdentity(params: {
  supabaseUserId: string
  fullName: string
  email: string
  age?: number
  role: string
  parentEmail?: string
  institutionName?: string
}): Promise<Identity> {
  const { rows } = await trPool.query(
    `INSERT INTO identities (supabase_user_id, full_name, email, age, role, parent_email, institution_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [params.supabaseUserId, params.fullName, params.email, params.age ?? null, params.role, params.parentEmail ?? null, params.institutionName ?? null]
  )
  return rows[0]
}

// Supabase user_id'den kimlik getir
export async function getIdentityBySupabaseId(supabaseUserId: string): Promise<Identity | null> {
  const { rows } = await trPool.query(
    `SELECT * FROM identities WHERE supabase_user_id = $1`,
    [supabaseUserId]
  )
  return rows[0] ?? null
}

// Birden çok Supabase user_id için toplu kimlik getir (sınıf listesi, sıralama, vb.)
// Tek sorguda döner — N+1 önlemek için.
export async function getIdentitiesBySupabaseIds(supabaseUserIds: string[]): Promise<Record<string, Identity>> {
  const uniqueIds = [...new Set(supabaseUserIds.filter(Boolean))]
  if (uniqueIds.length === 0) return {}
  const { rows } = await trPool.query(
    // ::text karşılaştırması, kolonun uuid ya da text olmasından bağımsız çalışır
    `SELECT * FROM identities WHERE supabase_user_id::text = ANY($1::text[])`,
    [uniqueIds]
  )
  const map: Record<string, Identity> = {}
  for (const row of rows as Identity[]) {
    map[row.supabase_user_id] = row
  }
  return map
}

// TR-PG'deki TÜM identity kayıtlarının supabase_user_id'lerini döner.
// Supabase profiles listesiyle karşılaştırıp eksik kimlikleri (identity
// oluşturma sırasında sessizce başarısız olmuş kayıtları) bulmak için
// kullanılır — bkz. lib/identity/reconcile.ts
export async function listAllIdentitySupabaseIds(): Promise<Set<string>> {
  const { rows } = await trPool.query(`SELECT supabase_user_id FROM identities`)
  return new Set(rows.map((r: { supabase_user_id: string }) => r.supabase_user_id))
}


export async function updateIdentity(supabaseUserId: string, updates: Partial<Identity>): Promise<void> {
  const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'supabase_user_id')
  if (fields.length === 0) return
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ')
  const values = fields.map(f => (updates as any)[f])
  await trPool.query(
    `UPDATE identities SET ${setClause} WHERE supabase_user_id = $1`,
    [supabaseUserId, ...values]
  )
}

// Rıza kaydet
export async function recordConsent(params: {
  identityId: string
  consentType: string
  version: string
  granted: boolean
  ipAddress?: string
}): Promise<void> {
  await trPool.query(
    `INSERT INTO consent_records (identity_id, consent_type, consent_version, granted, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.identityId, params.consentType, params.version, params.granted, params.ipAddress ?? null]
  )
}

// ─── Madde 7 (pratium-bekleyen-isler-uygulama-plani.md) — rıza versiyonlama,
// yeniden-onay akışı ve enforcement. Önceden rıza sadece kayıt anında
// alınıyordu, versiyon değişikliğinde yeniden onay istenmiyordu, ve
// veli_onayi=false olan bir kullanıcı hiçbir şekilde engellenmiyordu.

// Sözleşme/aydınlatma metni her değiştiğinde bu sabit güncellenir — kodun
// TEK kaynağı. app/api/auth/create-identity/route.ts (ilk kayıt) ve
// app/api/auth/consent-status/route.ts (yeniden-onay) İKİSİ DE buradan okur.
export const CURRENT_CONSENT_VERSIONS: Record<string, string> = {
  aydinlatma: 'v1.0',
  acik_riza_analiz: 'v1.0',
  veli_onayi: 'v1.0',
}

export interface ConsentStatusItem {
  consentType: string
  currentVersion: string
  latestGrantedVersion: string | null
  latestGranted: boolean | null
  needsReconsent: boolean
}

// Bir kimliğin, verilen her rıza türü için EN SON verdiği onayı güncel
// versiyonla karşılaştırır. needsReconsent=true olan herhangi bir tür
// varsa, istemci tarafında (components/ConsentGate.tsx) kullanıcıya
// yeniden onay ekranı gösterilir.
export async function getConsentStatus(identityId: string, applicableTypes: string[]): Promise<ConsentStatusItem[]> {
  if (applicableTypes.length === 0) return []
  const { rows } = await trPool.query(
    `SELECT DISTINCT ON (consent_type) consent_type, consent_version, granted, created_at
     FROM consent_records
     WHERE identity_id = $1
     ORDER BY consent_type, created_at DESC`,
    [identityId]
  )
  const latestByType = new Map(rows.map((r: any) => [r.consent_type, r]))
  return applicableTypes.map(type => {
    const latest = latestByType.get(type) as any
    const currentVersion = CURRENT_CONSENT_VERSIONS[type] || 'v1.0'
    return {
      consentType: type,
      currentVersion,
      latestGrantedVersion: latest?.consent_version ?? null,
      latestGranted: latest ? !!latest.granted : null,
      needsReconsent: !latest || latest.consent_version !== currentVersion,
    }
  })
}

// Enforcement — 18 yaş altı bir öğrenci için veli AÇIKÇA onay VERMEDİYSE
// (granted:false kaydı varsa) veri-yoğun özellikler (açık uçlu soru, sınav
// simülasyonu) engellenir. KAPSAM BİLİNÇLİ OLARAK DAR: hiç consent kaydı
// OLMAYAN (consent takibinden önce kayıt olmuş) kullanıcılar ENGELLENMEZ —
// aksi halde geriye dönük, migration'sız bir kesinti/regresyon riski
// olurdu. Bu, planın "minimum enforcement" hedefinin güvenli bir okuması.
export async function checkMinorConsentBlock(supabaseUserId: string): Promise<{ blocked: boolean; reason?: string }> {
  const identity = await getIdentityBySupabaseId(supabaseUserId)
  if (!identity || identity.age == null || identity.age >= 18) return { blocked: false }

  const { rows } = await trPool.query(
    `SELECT granted FROM consent_records
     WHERE identity_id = $1 AND consent_type = 'veli_onayi'
     ORDER BY created_at DESC LIMIT 1`,
    [identity.id]
  )
  if (rows.length > 0 && rows[0].granted === false) {
    return {
      blocked: true,
      reason: 'Veliniz bu özelliğe henüz onay vermemiş görünüyor. Lütfen veli hesabınızdan onayı güncelleyin ya da destek ekibiyle iletişime geçin.',
    }
  }
  return { blocked: false }
}

// Veli-çocuk bağlantısı oluştur
export async function linkParentChild(parentIdentityId: string, childIdentityId: string): Promise<void> {
  await trPool.query(
    `INSERT INTO parent_child_links (parent_identity_id, child_identity_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [parentIdentityId, childIdentityId]
  )
}

// KVKK talep kaydet
export async function recordKvkkRequest(identityId: string, type: string, status = 'pending'): Promise<void> {
  await trPool.query(
    `INSERT INTO kvkk_requests (identity_id, request_type, status) VALUES ($1, $2, $3)`,
    [identityId, type, status]
  )
}

// Kimliği tamamen sil (KVKK silme talebi)
export async function deleteIdentity(supabaseUserId: string): Promise<void> {
  await trPool.query(`DELETE FROM identities WHERE supabase_user_id = $1`, [supabaseUserId])
}

// Kullanıcının kendi verisini indirmesi için (taşınabilirlik)
export async function exportIdentityData(supabaseUserId: string) {
  const identity = await getIdentityBySupabaseId(supabaseUserId)
  if (!identity) return null

  const [consents, kvkkReqs] = await Promise.all([
    trPool.query(`SELECT * FROM consent_records WHERE identity_id = $1`, [identity.id]),
    trPool.query(`SELECT * FROM kvkk_requests WHERE identity_id = $1`, [identity.id]),
  ])

  return {
    identity,
    consent_records: consents.rows,
    kvkk_requests: kvkkReqs.rows,
  }
}

export default trPool
