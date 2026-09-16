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
  const { data, error } = await db.from('question_bank').update({ question: q, review_status: 'candidate', quality_score: 0, updated_at: new Date().toISOString() }).eq('id', body.id).select('id,review_status').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })
  return NextResponse.json({ success: true, question: data, message: 'Düzeltildi ve yeniden uzman onayına gönderildi.' })
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const { data, error } = await db.from('question_bank').select('id,question,subject_key,topic_key,grade_key,difficulty,review_status,updated_at').in('review_status', ['candidate', 'approved']).order('updated_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data || [] })
}
