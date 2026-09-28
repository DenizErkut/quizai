import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function isAdmin() {
  const c = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { get: n => c.get(n)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).single()
  if (data?.is_admin) return true
  const { data: teacher } = await db.from('teachers').select('id,approved,question_bank_editor').eq('user_id', user.id).maybeSingle()
  return Boolean(teacher?.approved && teacher?.question_bank_editor)
}

// Öğretmen sorusunu düzeltir ve yeniden uzman incelemesine alır.
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  if (!body.id || !body.question || typeof body.question !== 'object') return NextResponse.json({ error: 'id ve soru içeriği zorunlu.' }, { status: 400 })
  const q = body.question
  if (typeof q.q !== 'string' || !q.q.trim() || !Array.isArray(q.opts) || q.opts.length < 2 || !Number.isInteger(q.ans) || q.ans < 0 || q.ans >= q.opts.length) {
    return NextResponse.json({ error: 'Soru metni, seçenekler ve doğru cevap geçersiz.' }, { status: 400 })
  }
  // awaiting_expert_review=true: bu satır artık gölge-süresi otomatik
  // yükseltmesine (bkz. 20260923090000_question_bank_shadow_review.sql)
  // asla girmez — düzeltmeyi bir insan tekrar onaylamalı.
  const { data, error } = await db.from('question_bank').update({ question: q, review_status: 'candidate', awaiting_expert_review: true, quality_score: 0, updated_at: new Date().toISOString() }).eq('id', body.id).select('id,review_status').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })
  return NextResponse.json({ success: true, question: data, message: 'Düzeltildi ve yeniden uzman onayına gönderildi.' })
}

// Bir candidate satırı düzenlemeden doğrudan onaylar/reddeder — örn. AI
// üretimi bir soruyu gölge süresini beklemeden erken onaylamak ya da bir
// öğrenci raporu sonrası incelemeyi sonuçlandırmak için.
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { id?: string; decision?: string }
  if (!body.id || !['approved', 'rejected'].includes(body.decision || '')) {
    return NextResponse.json({ error: 'id ve decision (approved/rejected) zorunlu.' }, { status: 400 })
  }
  const { data, error } = await db.from('question_bank').update({
    review_status: body.decision,
    awaiting_expert_review: false,
    promoted_at: body.decision === 'approved' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', body.id).select('id,review_status').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })
  return NextResponse.json({ success: true, question: data })
}

// 27 Eylul 2026 — Deniz'in bulgusu: bu uc nokta eskiden filtre parametrelerini
// yok sayip her zaman en son guncellenen 200 satiri donduruyordu; sinif/ders/konu
// acilir kutulari da SADECE o 200 satirdan turetiliyordu (bkz. QuestionBankEditor.tsx).
// Toplu bir ekleme (ayni anda 200+ satir, hepsi taze updated_at ile) bu LIMIT 200'u
// tamamen doldurup butun diger sinif/ders/konulari panelden GORUNMEZ hale getirdi —
// veritabaninda hicbir kayip yoktu, sadece bu incelemenin varsayilan gorunumunde
// gizlenmislerdi. Duzeltme: (1) acilir kutu secenekleri artik havuzun TAMAMINDAN
// (facet sorgusu, review_status filtresiyle ama LIMIT olmadan) turetiliyor, (2)
// sinif/ders/konu filtreleri artik sunucu tarafinda uygulaniyor, boylece "LIMIT 200"
// sadece SECILEN filtreye uygulaniyor, tum havuza degil.
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const { searchParams } = new URL(req.url)
  const grade = searchParams.get('grade') || ''
  const subject = searchParams.get('subject') || ''
  const topic = searchParams.get('topic') || ''
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(20, Number.parseInt(searchParams.get('page_size') || '50', 10) || 50))

  // Facet'ler SQL tarafında DISTINCT ile üretilir. Böylece 100.000 soruluk
  // havuzda tüm satırları API belleğine taşımayız ve PostgREST satır sınırına
  // takılmayız.
  const { data: facets, error: facetError } = await db.rpc('question_bank_admin_facets_v1', {
    p_grade: grade || null,
    p_subject: subject || null,
  })
  if (facetError) return NextResponse.json({ error: facetError.message }, { status: 500 })

  let query = db.from('question_bank')
    .select('id,question,subject_key,topic_key,grade_key,difficulty,review_status,awaiting_expert_review,ai_provider,ai_model,report_count,promoted_at,updated_at', { count: 'exact' })
    .in('review_status', ['candidate', 'approved'])
  if (grade) query = query.eq('grade_key', grade)
  if (subject) query = query.eq('subject_key', subject)
  if (topic) query = query.eq('topic_key', topic)
  const from = (page - 1) * pageSize
  const { data, error, count } = await query.order('updated_at', { ascending: false }).range(from, from + pageSize - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data || [], facets, pagination: { page, page_size: pageSize, total: count || 0, total_pages: Math.max(1, Math.ceil((count || 0) / pageSize)) } })
}
