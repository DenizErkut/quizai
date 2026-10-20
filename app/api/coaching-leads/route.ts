// app/api/coaching-leads/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { validateLead } from '@/lib/lead-validation'

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
  const body = await req.json().catch(() => null)
  const checked = validateLead(body)
  if (checked.ok === false) return NextResponse.json({ error: checked.error }, { status: 400 })
  const lead = checked.value

  // Kötüye kullanım koruması (oturumsuz form): aynı e-postadan saatte 3, toplamda saatte 60 talep.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const [byEmail, overall] = await Promise.all([
    supabaseAdmin.from('coaching_leads').select('id', { count: 'exact', head: true }).eq('email', lead.email).gte('created_at', since),
    supabaseAdmin.from('coaching_leads').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ])
  if ((byEmail.count ?? 0) >= 3 || (overall.count ?? 0) >= 60) {
    return NextResponse.json({ error: 'Çok sık talep gönderildi. Lütfen biraz sonra tekrar deneyin.' }, { status: 429 })
  }

  const { error } = await supabaseAdmin.from('coaching_leads').insert({
    lead_type: lead.leadType,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    institution_name: lead.institutionName,
    student_grade: lead.studentGrade,
    message: lead.message,
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
  if (error) return NextResponse.json({ error: 'Talepler alınamadı.' }, { status: 500 })
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
