// app/api/teacher/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  // Öğretmen kontrolü
  const { data: teacher } = await supabaseAdmin
    .from('teachers')
    .select('id, approved')
    .eq('user_id', user.id)
    .single()
  if (!teacher?.approved) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const { student_id, assignment_id } = await req.json()
  if (!student_id || !assignment_id) {
    return NextResponse.json({ error: 'Eksik parametre.' }, { status: 400 })
  }

  // Önbellek: aynı analiz varsa getir
  const { data: cached } = await supabaseAdmin
    .from('teacher_student_analyses')
    .select('analysis, created_at')
    .eq('student_id', student_id)
    .eq('assignment_id', assignment_id)
    .eq('teacher_id', teacher.id)
    .maybeSingle()

  // 1 saatten eskiyse yeniden üret
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString()
  if (cached && cached.created_at > oneHourAgo) {
    return NextResponse.json({ analysis: cached.analysis, cached: true })
  }

  // Öğrenci bilgisi
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('name, grade')
    .eq('id', student_id)
    .maybeSingle()

  // Ödev bilgisi
  const { data: assignment } = await supabaseAdmin
    .from('assignments')
    .select('title, topic, difficulty, question_count')
    .eq('id', assignment_id)
    .maybeSingle()

  // Completion + cevaplar
  const { data: completion } = await supabaseAdmin
    .from('assignment_completions')
    .select('pct, score, answers, completed_at')
    .eq('assignment_id', assignment_id)
    .eq('student_id', student_id)
    .maybeSingle()

  if (!completion) {
    return NextResponse.json({ error: 'Bu öğrenci ödevi tamamlamamış.' }, { status: 404 })
  }

  // Son quiz sessionları (genel performans için)
  const { data: recentSessions } = await supabaseAdmin
    .from('quiz_sessions')
    .select('topic, pct, score, question_count, created_at')
    .eq('user_id', student_id)
    .eq('completed', true)
    .order('created_at', { ascending: false })
    .limit(10)

  // Cevapları işle
  const answers: any[] = completion.answers ?? []
  const wrongAnswers = answers.filter(a => !a.correct)
  const correctAnswers = answers.filter(a => a.correct)

  // AI prompt
  const prompt = `Sen deneyimli bir Türk eğitim uzmanısın. Bir öğrencinin ödev sonucunu analiz edeceksin.

## Öğrenci Bilgisi
Ad: ${profile?.name ?? 'Bilinmiyor'}
Sınıf: ${profile?.grade ?? 'Bilinmiyor'}

## Ödev Bilgisi
Başlık: ${assignment?.title ?? 'Bilinmiyor'}
Konu: ${assignment?.topic ?? 'Bilinmiyor'}
Zorluk: ${assignment?.difficulty ?? 'normal'}
Soru sayısı: ${assignment?.question_count ?? '?'}

## Sonuç
Puan: %${completion.pct} (${completion.score} doğru / ${assignment?.question_count ?? '?'} soru)
Tamamlanma: ${new Date(completion.completed_at).toLocaleDateString('tr-TR')}

## Yanlış Cevaplar (${wrongAnswers.length} adet)
${wrongAnswers.length === 0 ? 'Hiç yanlış yok — mükemmel!' : wrongAnswers.map((a, i) =>
  `${i + 1}. Soru: "${a.question ?? 'Bilinmiyor'}"
   Doğru cevap: ${a.correct_answer ?? 'Bilinmiyor'}
   Öğrencinin cevabı: ${a.student_answer ?? 'Bilinmiyor'}
   ${a.explanation ? `Açıklama: ${a.explanation}` : ''}`
).join('\n\n')}

## Son 10 Quiz Performansı
${recentSessions?.length ? recentSessions.map(s =>
  `- ${s.topic}: %${s.pct} (${new Date(s.created_at).toLocaleDateString('tr-TR')})`
).join('\n') : 'Veri yok'}

---

Lütfen şu formatta kısa ve öz bir analiz yaz (Türkçe):

**GENEL DEĞERLENDİRME**
(2-3 cümle: öğrencinin genel durumu, ödevi nasıl yaptığı)

**GÜÇLÜ YÖNLER**
(Neyi iyi yapıyor, hangi konularda başarılı)

**GELİŞTİRMESİ GEREKEN ALANLAR**
(Hangi konu/kavramlarda sorun var, yanlış cevaplardan çıkarımlar)

**ÖNERİLER**
(Öğretmene özel: bu öğrenciyle nasıl çalışmalı, hangi kaynaklara yönlendirmeli, 3-4 somut öneri)

**RİSK SEVİYESİ**
(Düşük / Orta / Yüksek — öğrenci ne kadar desteğe ihtiyaç duyuyor)`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  })

  const analysis = response.content[0].type === 'text' ? response.content[0].text : ''

  // Kaydet (upsert)
  await supabaseAdmin
    .from('teacher_student_analyses')
    .upsert({
      teacher_id: teacher.id,
      student_id,
      assignment_id,
      analysis,
      created_at: new Date().toISOString(),
    }, { onConflict: 'teacher_id,student_id,assignment_id' })

  return NextResponse.json({ analysis, cached: false })
}
