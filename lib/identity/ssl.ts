import type { ConnectionOptions } from 'tls'

// TR-PG TLS ayarı. Sertifika doğrulaması şu durumlarda AÇIKTIR:
//  - TR_IDENTITY_DB_CA (PEM; satır sonları \n ile de verilebilir) tanımlıysa, veya
//  - TR_IDENTITY_DB_SSL_VERIFY=true ise (sunucu sertifikası genel bir CA'dan geliyorsa).
// Aksi halde mevcut davranış korunur (şifreli ama doğrulamasız) ve bir kez uyarı yazılır;
// böylece CA tanımlanmadan canlıdaki kimlik bağlantısı kırılmaz.
let warned = false

export function identityDbSsl(env: Record<string, string | undefined> = process.env): false | ConnectionOptions {
  if (env.TR_IDENTITY_DB_SSL !== 'true') return false
  const ca = env.TR_IDENTITY_DB_CA?.replace(/\\n/g, '\n').trim()
  if (ca) return { rejectUnauthorized: true, ca }
  if (env.TR_IDENTITY_DB_SSL_VERIFY === 'true') return { rejectUnauthorized: true }
  if (!warned) {
    warned = true
    console.warn('[identity-db] SSL sertifikası doğrulanmıyor; TR_IDENTITY_DB_CA veya TR_IDENTITY_DB_SSL_VERIFY=true tanımlayın.')
  }
  return { rejectUnauthorized: false }
}
