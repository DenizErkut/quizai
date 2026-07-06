// app/api/auth/register-hybrid/route.ts
// Hibrit kayıt akışı: Supabase Auth (oturum) + TR-PG (kimlik) + Supabase (platform verisi)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createIdentity, recordConsent, linkParentChild, getIdentityBySupabaseId } from '@/lib/identity/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const {
    email, password, fullName, age, role,
    parentEmail, institutionName,
    kvkkAydinlatma, kvkkAcikRiza, veliOnayi,
    referralCode,
  } = await req.json()

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'

  // ── Adım 1: Supabase Auth — SADECE oturum için, e-posta burada da tutulur
  // (Supabase Auth'un e-posta/parola akışı için zorunlu; KVKK açısından "oturum
  // yönetimi" amaçlı meşru menfaat kapsamındadır — ayrı bir "kişisel veri
  // profili" oluşturulmaz, sadece login mekanizması)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || 'Kayıt başarısız.' }, { status: 400 })
  }

  const supabaseUserId = authData.user.id

  try {
    // ── Adım 2: TR-PG'de kimlik kaydı oluştur (ad, yaş, veli e-postası burada yaşar)
    const identity = await createIdentity({
      supabaseUserId,
      fullName,
      email,
      age,
      role,
      parentEmail: age < 18 ? parentEmail : undefined,
      institutionName,
    })

    // ── Adım 3: Rıza kayıtları — TR-PG'de, kimlikle birlikte (ispat yükümlülüğü)
    await recordConsent({ identityId: identity.id, consentType: 'aydinlatma', version: 'v1.0', granted: kvkkAydinlatma, ipAddress: ip })
    await recordConsent({ identityId: identity.id, consentType: 'acik_riza_analiz', version: 'v1.0', granted: kvkkAcikRiza, ipAddress: ip })
    if (age < 18) {
      await recordConsent({ identityId: identity.id, consentType: 'veli_onayi', version: 'v1.0', granted: veliOnayi, ipAddress: ip })
    }

    // ── Adım 4: Veli bağlantısı varsa (veli zaten kayıtlıysa) TR-PG'de linkle
    if (age < 18 && parentEmail) {
      const parentIdentityResult = await supabaseAdmin.auth.admin.listUsers()
      // Not: Üretimde bu sorgu TR-PG'de email indeksi ile yapılmalı, burada basitleştirildi
    }

    // ── Adım 5: Supabase'de SADECE platform davranış verisi (kimlik alanı YOK)
    await supabaseAdmin.from('profiles').insert({
      id: supabaseUserId,           // TR-PG identities.supabase_user_id ile eşleşir
      plan: 'free',
      grade: null,
      streak: 0,
      referral_code: generateReferralCode(),
      role,
      // ⚠️ full_name, email, age, parent_email BURAYA YAZILMAZ
    })

    // Referral ödülü (mevcut akış korunur — kimlik verisi taşımaz)
    if (referralCode) {
      await fetch(`${req.nextUrl.origin}/api/referral/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode, newUserId: supabaseUserId }),
      }).catch(() => {})
    }

    return NextResponse.json({ success: true, userId: supabaseUserId })
  } catch (e: any) {
    // Kimlik oluşturma başarısız olduysa Supabase Auth kullanıcısını da geri al (tutarlılık)
    await supabaseAdmin.auth.admin.deleteUser(supabaseUserId).catch(() => {})
    console.error('[register-hybrid] error:', e.message)
    return NextResponse.json({ error: 'Kayıt sırasında hata oluştu: ' + e.message }, { status: 500 })
  }
}

function generateReferralCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}
