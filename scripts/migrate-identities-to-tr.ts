// scripts/migrate-identities-to-tr.ts
// TEK SEFERLİK script: Mevcut Supabase profiles verilerini TR-PG'ye taşır.
// Çalıştırma: npx tsx scripts/migrate-identities-to-tr.ts
//
// ⚠️ ÇALIŞTIRMADAN ÖNCE:
// 1. TR sunucusu kurulu ve tr-identity-schema.sql çalıştırılmış olmalı
// 2. TR_IDENTITY_DB_URL ortam değişkeni set edilmiş olmalı
// 3. Supabase profiles tablosunda full_name/email/age hâlâ mevcut olmalı
//    (supabase-profiles-migration.sql henüz ÇALIŞTIRILMAMIŞ olmalı!)

import { createClient } from '@supabase/supabase-js'
import { Pool } from 'pg'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const trPool = new Pool({ connectionString: process.env.TR_IDENTITY_DB_URL })

async function migrate() {
  console.log('🔄 Migration başlıyor...')

  // Supabase auth.users + profiles birleşik veri çek
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, age, role, parent_email, institution_name, phone')

  if (error) {
    console.error('❌ Supabase okuma hatası:', error.message)
    process.exit(1)
  }

  console.log(`📊 ${profiles.length} kullanıcı bulundu, taşınıyor...`)

  let success = 0, failed = 0

  for (const p of profiles) {
    try {
      await trPool.query(
        `INSERT INTO identities (supabase_user_id, full_name, email, age, role, parent_email, institution_name, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (supabase_user_id) DO NOTHING`,
        [p.id, p.full_name || 'İsimsiz', p.email, p.age, p.role || 'student', p.parent_email, p.institution_name, p.phone]
      )
      success++
    } catch (e: any) {
      console.error(`❌ ${p.id} taşınamadı:`, e.message)
      failed++
    }
  }

  console.log(`✅ Taşıma tamamlandı: ${success} başarılı, ${failed} başarısız`)

  // Doğrulama
  const { rows } = await trPool.query('SELECT COUNT(*) FROM identities')
  console.log(`🔍 TR-PG'de toplam kayıt: ${rows[0].count}`)
  console.log(`🔍 Supabase'de toplam kayıt: ${profiles.length}`)

  if (parseInt(rows[0].count) !== profiles.length) {
    console.warn('⚠️  UYARI: Kayıt sayıları eşleşmiyor! supabase-profiles-migration.sql çalıştırmadan önce farkı incele.')
  } else {
    console.log('✅ Kayıt sayıları eşleşiyor. supabase-profiles-migration.sql çalıştırılabilir.')
  }

  await trPool.end()
}

migrate().catch(console.error)
