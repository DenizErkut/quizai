// Öğretmen: Test/Quiz ödevi için onaylı soru bankasından (question_bank) soru seçer. Yapay zekâ ve kota kullanılmaz.
//   POST {grade, topic, count, questionType?} → { questions, available }
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { questionBankKey } from '@/lib/question-bank'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: teacher } = await db.from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()
  if (!teacher?.approved) return NextResponse.json({ error: 'Onaylı öğretmen hesabı gerekir.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { grade?: string; topic?: string; count?: number; questionType?: string } | null
  const gradeNo = String(body?.grade || '').match(/\d{1,2}/)?.[0]
  const topic = String(body?.topic || '').trim()
  const count = Math.min(30, Math.max(1, Math.trunc(Number(body?.count) || 10)))
  if (!gradeNo || !topic) return NextResponse.json({ error: 'Sınıf seviyesi ve konu zorunlu.' }, { status: 400 })

  const tokens = questionBankKey(topic).split(' ').filter(word => word.length >= 4).map(word => word.slice(0, Math.max(4, word.length - 2)))
  if (!tokens.length) return NextResponse.json({ error: 'Konu en az 4 harfli bir sözcük içermeli.' }, { status: 400 })

  let request = db.from('question_bank').select('id, question, topic_key')
    .eq('review_status', 'approved').eq('report_count', 0)
    .or(`grade_key.ilike.* ${gradeNo} sinif,grade_key.ilike.${gradeNo} sinif,grade_key.ilike.${gradeNo} sınıf,grade_key.ilike.* ${gradeNo} sınıf`)
    .or(tokens.map(word => `topic_key.ilike.*${word.replace(/[*%,()]/g, '')}*`).join(','))
    .limit(400)
  const requestedType = String(body?.questionType || '')
  if (requestedType && requestedType !== 'mixed') request = request.eq('question_type', requestedType)
  const { data, error } = await request
  if (error) return NextResponse.json({ error: 'Havuz okunamadı.' }, { status: 500 })

  const usable = (data || []).filter(row => row.question && typeof row.question === 'object' && (row.question as { q?: unknown }).q)
  const shuffled = usable.map(row => [Math.random(), row] as const).sort((a, b) => a[0] - b[0]).map(item => item[1])
  const questions = shuffled.slice(0, count).map(row => row.question)
  if (!questions.length) return NextResponse.json({ error: 'Bu sınıf ve konu için havuzda onaylı soru bulunamadı.', available: 0 }, { status: 404 })
  return NextResponse.json({ questions, available: usable.length })
}
