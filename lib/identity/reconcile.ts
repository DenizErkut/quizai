// lib/identity/reconcile.ts
// Supabase profiles ↔ TR-PG identities uyumsuzluğunu bulur ve otomatik düzeltir.
//
// Neden gerekli: OAuth girişinde (auth/callback) ya da admin'in kurum
// hesabı oluşturmasında (create-institution) TR-PG'ye kimlik yazma adımı
// başarısız olursa (geçici bağlantı sorunu, kısıt hatası, vb.) kullanıcı
// Supabase'de var ama TR-PG'de "isimsiz" kalabiliyordu. Bu modül, iki
// kaynağı karşılaştırıp eksikleri gerçek verilerle (auth.users metadata)
// otomatik geri dolduruyor — elle SQL yazmaya gerek kalmasın diye.
//
// Kullanan yerler:
//   - app/api/admin/reconcile-identities/route.ts (admin panelinden manuel tetik)
//   - app/api/cron/reconcile-identities/route.ts (günlük otomatik tarama)

import { createClient } from '@supabase/supabase-js'
import { createIdentity, listAllIdentitySupabaseIds } from '@/lib/identity/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// identities.role CHECK constraint'iyle birebir aynı olmalı (TR-PG'de
// scripts/tr-pg/001_add_institution_admin_role.sql ile genişletildi).
const ALLOWED_IDENTITY_ROLES = new Set(['student', 'teacher', 'parent', 'institution_admin'])

export interface ReconcileResult {
  checked: number
  missing: number
  fixed: number
  fixedUsers: { id: string; fullName: string; role: string }[]
  failed: { id: string; reason: string }[]
}

export async function reconcileIdentities(opts: { dryRun?: boolean } = {}): Promise<ReconcileResult> {
  const dryRun = !!opts.dryRun

  // 1. Supabase'deki tüm kullanıcı ID + rollerini çek
  const { data: profiles, error: profilesErr } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
  if (profilesErr) throw new Error(`profiles çekilemedi: ${profilesErr.message}`)

  // 2. TR-PG'deki mevcut kimliklerin ID setini çek
  const existingIds = await listAllIdentitySupabaseIds()

  // 3. Eksikleri bul
  const missingProfiles = (profiles ?? []).filter(p => !existingIds.has(p.id))

  const result: ReconcileResult = {
    checked: profiles?.length ?? 0,
    missing: missingProfiles.length,
    fixed: 0,
    fixedUsers: [],
    failed: [],
  }

  if (dryRun || missingProfiles.length === 0) return result

  // 4. Her eksik kayıt için Supabase Auth'tan gerçek ad/e-posta çek ve
  //    TR-PG'de kimliği oluştur.
  for (const profile of missingProfiles) {
    try {
      const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(profile.id)
      if (userErr || !userData?.user) {
        result.failed.push({ id: profile.id, reason: `auth.users bulunamadı: ${userErr?.message || 'kullanıcı yok'}` })
        continue
      }
      const user = userData.user
      const fullName =
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email?.split('@')[0] ||
        'Kullanıcı'

      // Rol, identities.role constraint'inin izin verdiği değerlerden biri
      // değilse (örn. ileride eklenecek yeni bir platform rolü), otomatik
      // yazmaya çalışıp constraint hatasına çarpmak yerine "manuel bakılsın"
      // diye failed listesine ekle.
      const role = profile.role
      if (!role || !ALLOWED_IDENTITY_ROLES.has(role)) {
        result.failed.push({
          id: profile.id,
          reason: `profiles.role ('${role ?? 'null'}') identities.role constraint'inde tanımlı değil — manuel kontrol gerekli`,
        })
        continue
      }

      await createIdentity({
        supabaseUserId: profile.id,
        fullName,
        email: user.email || '',
        role,
      })

      result.fixed++
      result.fixedUsers.push({ id: profile.id, fullName, role })
    } catch (e: any) {
      result.failed.push({ id: profile.id, reason: e?.message || 'bilinmeyen hata' })
    }
  }

  return result
}
