import type { ConnectionOptions } from 'tls'

// TR-PG TLS ayarı. Sertifika doğrulaması şu durumlarda AÇIKTIR:
//  - TR_IDENTITY_DB_CA (PEM; satır sonları \n ile de verilebilir) tanımlıysa, veya
//  - TR_IDENTITY_DB_SSL_VERIFY=true ise (sunucu sertifikası genel bir CA'dan geliyorsa).
// Bağlantı adresi IP ise ve sertifika bir ada (CN) düzenlenmişse TR_IDENTITY_DB_SSL_SERVERNAME ile
// sertifika adı verilir; sertifika yine TR_IDENTITY_DB_CA ile sabitlenir ve bu ada karşı doğrulanır.
// Aksi halde mevcut davranış korunur (şifreli ama doğrulamasız) ve bir kez uyarı yazılır;
// böylece CA tanımlanmadan canlıdaki kimlik bağlantısı kırılmaz.
let warned = false

export function identityDbSsl(env: Record<string, string | undefined> = process.env): false | ConnectionOptions {
  if (env.TR_IDENTITY_DB_SSL !== 'true') return false
  const ca = env.TR_IDENTITY_DB_CA?.replace(/\\n/g, '\n').trim()
  const servername = env.TR_IDENTITY_DB_SSL_SERVERNAME?.trim()
  if (ca) return { rejectUnauthorized: true, ca, ...(servername ? { servername } : {}) }
  if (env.TR_IDENTITY_DB_SSL_VERIFY === 'true') return { rejectUnauthorized: true, ...(servername ? { servername } : {}) }
  if (!warned) {
    warned = true
    console.warn('[identity-db] SSL sertifikası doğrulanmıyor; TR_IDENTITY_DB_CA veya TR_IDENTITY_DB_SSL_VERIFY=true tanımlayın.')
  }
  return { rejectUnauthorized: false }
}
