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
  role: 'student' | 'teacher' | 'parent'
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

// Kimlik güncelle
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
