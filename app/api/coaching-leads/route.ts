// app/api/coaching-leads/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  return p?.is_admin ? user : null
}

// POST — herkese açık, /ozel-kocluk formundan gelir
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { leadType, name, email, phone, institutionName, studentGrade, message } = body

  if (!leadType || !['kurum', 'bireysel'].includes(leadType)) {
    return NextResponse.json({ error: 'Geçersiz talep türü.' }, { status: 400 })
  }
  if (!name?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'İsim ve e-posta zorunlu.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('coaching_leads').insert({
    lead_type: leadType,
    name: name.trim(),
    email: email.trim(),
    phone: phone?.trim() || null,
    institution_name: institutionName?.trim() || null,
    student_grade: studentGrade?.trim() || null,
    message: message?.trim() || null,
  })

  if (error) return NextResponse.json({ error: 'Kaydedilemedi, lütfen tekrar dene.' }, { status: 500 })
  return NextResponse.json({ success: true })
}

// GET — admin-only, tüm talepleri listeler
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('coaching_leads').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data })
}

// PATCH — admin-only, durum güncelle
export async function PATCH(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const { id, status } = await req.json()
  if (!id || !['yeni', 'gorusuldu', 'anlasma', 'reddedildi'].includes(status)) {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('coaching_leads').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
