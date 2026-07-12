// scripts/migrate-identities-to-tr.ts
// TEK SEFERLİK script: Mevcut Supabase profiles verilerini TR-PG'ye KOPYALAR.
// SADECE OKUR — Supabase'e hiçbir şey yazmaz, hiçbir şey silmez. Bu yüzden
// güvenle defalarca denenebilir; yanlış giderse sadece TR-PG'deki `identities`
// tablosunu boşaltıp (`TRUNCATE identities;`) baştan başlarsın, Supabase'e
// hiç dokunulmaz.
//
// ÇALIŞTIRMA:
//   npx tsx scripts/migrate-identities-to-tr.ts             → gerçek yazma
//   npx tsx scripts/migrate-identities-to-tr.ts --dry-run    → sadece önizleme,
//                                                               TR-PG'ye HİÇBİR ŞEY YAZMAZ
//
// ÖNCE GEREKLİ ORTAM DEĞİŞKENLERİ (proje kökünde .env.local'da olmalı):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   TR_IDENTITY_DB_URL
//
// ⚠️ ÖNEMLİ — GERÇEK ŞEMAYA GÖRE DÜZELTİLDİ (önceki sürüm yanlış kolon adları
// varsayıyordu ve ilk sorguda hata verirdi):
//   - full_name  → Supabase'de 'profiles.name' (kayıtta ad+soyad zaten birleşik)
//   - email      → 'profiles'ta yok, auth.users'tan admin API ile çekiliyor
//   - age        → HİÇBİR YERDE saklanmıyor (bilinçli ürün kararı) — mevcut
//                  kullanıcılar için NULL kalacak, sadece BUNDAN SONRA
//                  register-hybrid ile kayıt olan yeni kullanıcılarda dolacak
//   - parent_email → aynı sebeple NULL kalacak (veli bağlantısı parent_code ile
//                  farklı bir mekanizmayla çalışıyor, e-posta eşleşmesi yok)
//   - institution_name → doğrudan kolon değil, institution_users→institutions
//                  join'i ile bulunuyor
//   - phone      → doğrudan 'profiles.phone', değişmedi

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'

const REQUIRED_ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TR_IDENTITY_DB_URL']
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length > 0) {
  console.error(`❌ Eksik ortam değişkeni: ${missing.join(', ')}`)
  console.error('   Bu değişkenlerin proje kökündeki .env.local dosyasında tanımlı olduğundan emin ol.')
  process.exit(1)
}

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const trPool = new Pool({
  connectionString: process.env.TR_IDENTITY_DB_URL,
  ssl: { rejectUnauthorized: false },
})

// auth.users korumalı şemada olduğu için PostgREST ile doğrudan sorgulanamaz —
// admin API ile, sayfalayarak (200'er) çekiyoruz.
async function fetchAllAuthEmails(): Promise<Map<string, string>> {
  const emailMap = new Map<string, string>()
  let page = 1
  const perPage = 200
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('❌ auth.users okunamadı:', error.message)
      process.exit(1)
    }
    for (const u of data.users) {
      if (u.email) emailMap.set(u.id, u.email)
    }
    if (data.users.length < perPage) break
    page++
  }
  return emailMap
}

// institution_users + institutions join'i ile kullanıcı → kurum adı eşlemesi
async function fetchInstitutionNames(): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>()
  const { data, error } = await supabase
    .from('institution_users')
    .select('user_id, institutions(name)')

  if (error) {
    console.warn('⚠️  Kurum bilgisi okunamadı (kritik değil, boş bırakılacak):', error.message)
    return nameMap
  }
  for (const row of (data || []) as any[]) {
    const instName = row.institutions?.name
    if (instName) nameMap.set(row.user_id, instName)
  }
  return nameMap
}

async function migrate() {
  console.log(DRY_RUN
    ? '🔍 KURU ÇALIŞTIRMA — TR-PG\'ye hiçbir şey yazılmayacak, sadece önizleme.\n'
    : '🔄 Migration başlıyor (gerçek yazma)...\n')

  console.log('1/4 — Supabase profiles okunuyor...')
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, phone, role')

  if (error) {
    console.error('❌ Supabase okuma hatası:', error.message)
    process.exit(1)
  }
  console.log(`    ✅ ${profiles.length} profil bulundu\n`)

  console.log('2/4 — E-posta adresleri (auth.users) okunuyor...')
  const emailMap = await fetchAllAuthEmails()
  console.log(`    ✅ ${emailMap.size} e-posta bulundu\n`)

  console.log('3/4 — Kurum bağlantıları okunuyor...')
  const institutionMap = await fetchInstitutionNames()
  console.log(`    ✅ ${institutionMap.size} kurum bağlantısı bulundu\n`)

  console.log(`4/4 — ${profiles.length} kayıt ${DRY_RUN ? 'önizleniyor' : "TR-PG'ye yazılıyor"}...\n`)

  let success = 0, failed = 0, skippedNoEmail = 0

  for (const p of profiles) {
    const email = emailMap.get(p.id)
    if (!email) {
      console.warn(`    ⚠️  ${p.id} (${p.name}) — e-posta bulunamadı, atlanıyor`)
      skippedNoEmail++
      continue
    }

    const record = {
      supabase_user_id: p.id,
      full_name: p.name || 'İsimsiz',
      email,
      age: null as number | null, // bkz. dosya başındaki not
      role: p.role || 'student',
      parent_email: null as string | null, // bkz. dosya başındaki not
      institution_name: institutionMap.get(p.id) || null,
      phone: p.phone || null,
    }

    if (DRY_RUN) {
      console.log(`    [ÖNİZLEME] ${record.full_name} <${record.email}> — rol: ${record.role}${record.institution_name ? ', kurum: ' + record.institution_name : ''}`)
      success++
      continue
    }

    try {
      await trPool.query(
        `INSERT INTO identities (supabase_user_id, full_name, email, age, role, parent_email, institution_name, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (supabase_user_id) DO NOTHING`,
        [record.supabase_user_id, record.full_name, record.email, record.age, record.role, record.parent_email, record.institution_name, record.phone]
      )
      success++
    } catch (e: any) {
      console.error(`    ❌ ${p.id} (${p.name}) taşınamadı:`, e.message)
      failed++
    }
  }

  console.log(`\n✅ Tamamlandı: ${success} başarılı, ${failed} hatalı, ${skippedNoEmail} e-postasız (atlandı)\n`)

  if (DRY_RUN) {
    console.log('Bu bir kuru çalıştırmaydı, TR-PG\'ye hiçbir şey yazılmadı.')
    console.log('Sonuçlar doğru görünüyorsa, --dry-run OLMADAN tekrar çalıştır.')
    await trPool.end()
    return
  }

  // Doğrulama
  const { rows } = await trPool.query('SELECT COUNT(*) FROM identities')
  console.log(`🔍 TR-PG'de toplam kayıt: ${rows[0].count}`)
  console.log(`🔍 Supabase'de toplam profil: ${profiles.length} (${skippedNoEmail} e-postasız atlandı)`)

  const expectedCount = profiles.length - skippedNoEmail
  if (parseInt(rows[0].count) !== expectedCount) {
    console.warn(`⚠️  UYARI: Kayıt sayıları tam eşleşmiyor (beklenen: ${expectedCount}, TR-PG'de: ${rows[0].count}).`)
    console.warn('    Devam etmeden önce farkı incele. Supabase\'den HİÇBİR ŞEY SİLME.')
  } else {
    console.log('✅ Kayıt sayıları eşleşiyor.')
  }

  await trPool.end()
}

migrate().catch(err => {
  console.error('\n❌ Beklenmeyen hata:', err)
  process.exit(1)
})
