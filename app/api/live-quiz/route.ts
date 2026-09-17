import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/ai-usage'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const anthropic = new Anthropic()

export const maxDuration = 120
export const runtime = 'nodejs'

// Öğretmen: canlı quiz oluştur ve sınıfa gönder
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: teacher } = await supabase.from('teachers').select('id,approved').eq('user_id', user.id).single()
  if (!teacher?.approved) return NextResponse.json({ error: 'Onaylı öğretmen değilsiniz.' }, { status: 403 })

  const { classroom_id, topic, question_count = 5, difficulty = 'normal', question_type = 'multiple_choice', time_per_question = 30 } = await req.json()
  if (!classroom_id || !topic) return NextResponse.json({ error: 'Eksik parametre.' }, { status: 400 })

  // Sınıfın bu öğretmene ait olduğunu doğrula
  const { data: classroom } = await supabase.from('classrooms').select('id,name').eq('id', classroom_id).eq('teacher_id', teacher.id).single()
  if (!classroom) return NextResponse.json({ error: 'Bu sınıf size ait değil.' }, { status: 403 })

  // Soruları üret
  const prompt = `Sen bir öğretmen asistanısın. "${topic}" konusunda ${question_count} adet ${difficulty} zorlukta çoktan seçmeli soru üret.
Her soru 4 şıklı (A,B,C,D), MEB müfredatına uygun olsun.
SADECE geçerli JSON döndür:
{"questions":[{"q":"Soru metni","opts":["A","B","C","D"],"ans":0,"exp":"Kısa açıklama"}]}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4000,
    system: 'Sadece geçerli JSON döndür, markdown kullanma.',
    messages: [{ role: 'user', content: prompt }],
  })
    await logAnthropicUsage('live-quiz', 'claude-sonnet-4-5', response, { userId: user.id })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  let questions: any[] = []
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    questions = parsed.questions || []
  } catch {
    return NextResponse.json({ error: 'Soru üretilemedi.' }, { status: 500 })
  }

  // live_quizzes tablosuna kaydet
  const joinCode = Math.random().toString(36).substring(2, 7).toUpperCase()
  const { data: liveQuiz } = await supabase.from('live_quizzes').insert({
    teacher_id: teacher.id,
    classroom_id,
    topic,
    questions,
    join_code: joinCode,
    time_per_question,
    status: 'waiting', // waiting | active | finished
    current_question: 0,
    started_at: null,
  }).select('id,join_code').single()

  // Sınıftaki öğrencilere bildirim gönder
  const { data: students } = await supabase.from('classroom_students').select('student_id').eq('classroom_id', classroom_id)
  const studentIds = (students ?? []).map((s: any) => s.student_id)

  if (studentIds.length > 0) {
    await supabase.from('notifications').insert(
      studentIds.map((sid: string) => ({
        user_id: sid,
        type: 'live_quiz',
        title: '🎯 Canlı Quiz Başlıyor!',
        body: `${classroom.name} sınıfında "${topic}" konusunda quiz başlıyor. Katılmak için tıkla!`,
        read: false,
        data: { live_quiz_id: liveQuiz?.id, join_code: joinCode },
      }))
    )
  }

  return NextResponse.json({ liveQuizId: liveQuiz?.id, joinCode, questionCount: questions.length })
}

// Öğretmen: quiz durumunu güncelle (başlat / sonraki soru / bitir)
export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: teacher } = await supabase.from('teachers').select('id').eq('user_id', user.id).single()
  if (!teacher) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const { live_quiz_id, action, current_question } = await req.json()
  // action: 'start' | 'reveal' | 'next' | 'finish'
  //
  // 'reveal': öğretmen bir soru bittiğinde "Sıralamayı Göster" diyor — soru
  // değişmiyor ama revealing=true oluyor, bu da Realtime/polling ile
  // öğrenci tarafında (bkz. app/live/LiveContent.tsx) ara liderlik tablosu
  // ekranını tetikliyor. Yarış hissi bunun üzerine kuruluyor.
  const nowIso = new Date().toISOString()
  const updates: any = {}
  if (action === 'start') { updates.status = 'active'; updates.started_at = nowIso; updates.current_question = 0; updates.question_started_at = nowIso; updates.revealing = false }
  else if (action === 'reveal') { updates.revealing = true }
  else if (action === 'next') { updates.current_question = current_question; updates.question_started_at = nowIso; updates.revealing = false }
  else if (action === 'finish') { updates.status = 'finished'; updates.finished_at = nowIso; updates.revealing = false }

  const { data } = await supabase.from('live_quizzes')
    .update(updates)
    .eq('id', live_quiz_id)
    .eq('teacher_id', teacher.id)
    .select()
    .single()

  return NextResponse.json({ success: true, quiz: data })
}

// Öğrenci: cevap gönder
export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { live_quiz_id, question_index, chosen_answer } = await req.json()

  // live_quiz'i çek — doğru cevabı kontrol et
  const { data: lq } = await supabase.from('live_quizzes').select('questions,question_started_at,time_per_question').eq('id', live_quiz_id).single()
  if (!lq) return NextResponse.json({ error: 'Quiz bulunamadı.' }, { status: 404 })

  const question = lq.questions[question_index]
  const is_correct = question?.ans === chosen_answer

  // Cevap süresi (ms) — question_started_at, öğretmenin bu soruyu açtığı an
  // (PATCH 'start'/'next') sunucuda set ediliyor. Eksikse (eski kayıt/edge
  // case) süre bazlı puanlamayı devre dışı bırakıp sadece doğruluk puanı ver.
  const now = new Date()
  const startedAt = lq.question_started_at ? new Date(lq.question_started_at) : null
  const response_ms = startedAt ? Math.max(0, now.getTime() - startedAt.getTime()) : null
  const timeLimitMs = (lq.time_per_question || 30) * 1000

  // Kahoot tarzı puanlama: doğru cevap her zaman en az 500, en fazla 1000
  // puan — ne kadar hızlı cevaplarsa o kadar yüksek. Yanlış cevap 0 puan.
  // Deniz'in tercihi: "her soru sonrası ilk 3'ü göstermek" için doğruluk +
  // hız birlikte değerlendirilsin.
  let score = 0
  if (is_correct) {
    if (response_ms === null) {
      score = 1000
    } else {
      const elapsedRatio = Math.min(1, response_ms / timeLimitMs)
      score = Math.round(1000 - 500 * elapsedRatio)
    }
  }

  // Upsert: aynı soru için tekrar cevap gönderilirse güncelle
  await supabase.from('live_quiz_answers').upsert({
    live_quiz_id,
    user_id: user.id,
    question_index,
    chosen_answer,
    is_correct,
    response_ms,
    score,
    answered_at: now.toISOString(),
  }, { onConflict: 'live_quiz_id,user_id,question_index' })

  return NextResponse.json({ is_correct, correct_ans: question?.ans, score })
}

// Öğrenci: quize katıl (join kaydı — question_index: -1 ile marker)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const live_quiz_id = searchParams.get('live_quiz_id')
  if (!live_quiz_id) return NextResponse.json({ error: 'live_quiz_id gerekli.' }, { status: 400 })

  // question_index: -1 = "katıldı" marker'ı — sadece bir kez yaz
  await supabase.from('live_quiz_answers').upsert({
    live_quiz_id,
    user_id: user.id,
    question_index: -1,
    chosen_answer: -1,
    is_correct: false,
    answered_at: new Date().toISOString(),
  }, { onConflict: 'live_quiz_id,user_id,question_index' })

  return NextResponse.json({ success: true })
}
