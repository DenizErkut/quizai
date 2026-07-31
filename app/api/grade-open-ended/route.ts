// app/api/grade-open-ended/route.ts
// Ogrencinin yazdigi cevabi, uretim sirasinda kaydedilen rubrige (dereceli
// puanlama anahtari) gore kriter kriter degerlendirir - MEB'in ogretmenlere
// "puanlar goruş bildiren degil, delillerle desteklenen yanitlara verilir"
// seklinde tarif ettigi yaklasimi AI'a talimat olarak veriyoruz.

import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 60
export const runtime = 'nodejs'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { sessionId, studentAnswer } = body as { sessionId: string; studentAnswer: string }
    if (!sessionId || !studentAnswer?.trim()) {
      return NextResponse.json({ error: 'Cevap boş olamaz.' }, { status: 400 })
    }

    // Rubrigi ve soruyu SUNUCUDAN oku - istemciden gelen rubrige guvenilmez
    // (aksi halde biri devtools'tan rubrigi degistirip tam puan alabilirdi)
    const { data: session, error: fetchErr } = await supabase
      .from('open_ended_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (fetchErr || !session) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })

    const rubricText = (session.rubric as any[])
      .map((r, i) => `${i + 1}. ${r.criterion} (${r.maxPoints} puan): ${r.description}`)
      .join('\n')

    const prompt = `Sen MEB'in "Açık Uçlu Soruların Puanlanması Kursu" eğitiminden geçmiş, dereceli puanlama anahtarına (rubrik) göre değerlendirme yapan deneyimli bir öğretmensin.
Puanlama ilkesi: puanlar görüş bildiren değil, DELİLLERLE DESTEKLENEN yanıtlara verilir. Kısmi puan vermekten çekinme - bir kriterin bir kısmı karşılanmışsa o kısmına denk gelen puanı ver.

SENARYO: ${session.scenario}
SORU: ${session.question}

DERECELI PUANLAMA ANAHTARI:
${rubricText}
(Toplam: ${session.total_possible} puan)

ÖĞRENCİNİN CEVABI:
"""
${studentAnswer.trim()}
"""

Her kriteri ayrı ayrı değerlendir, kaç puan hak ettiğini belirle (0 ile o kriterin maxPoints'i arasında, tam sayı) ve öğrenciye yönelik kısa, yapıcı bir geri bildirim yaz (1-2 cümle, doğrudan öğrenciye hitaben "sen" dilinde).
Ayrıca genel bir değerlendirme cümlesi yaz.

SADECE aşağıdaki JSON formatında yanıt ver:
{
  "criteriaResults": [
    { "criterion": "Kriter adı (rubrikteki ile birebir aynı)", "maxPoints": 30, "earnedPoints": 22, "feedback": "Kısa geri bildirim" }
  ],
  "overallFeedback": "Genel değerlendirme (2-3 cümle, motive edici ama dürüst)"
}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    let parsed
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
      else throw new Error('AI yanıtı ayrıştırılamadı.')
    }

    if (!Array.isArray(parsed?.criteriaResults)) {
      return NextResponse.json({ error: 'Puanlama başarısız, tekrar dene.' }, { status: 500 })
    }

    const totalEarned = parsed.criteriaResults.reduce((s: number, r: any) => s + (r.earnedPoints || 0), 0)

    await supabase.from('open_ended_sessions').update({
      student_answer: studentAnswer.trim(),
      criteria_results: parsed.criteriaResults,
      total_earned: totalEarned,
      overall_feedback: parsed.overallFeedback || '',
      graded_at: new Date().toISOString(),
    }).eq('id', sessionId)

    return NextResponse.json({
      criteriaResults: parsed.criteriaResults,
      overallFeedback: parsed.overallFeedback || '',
      totalEarned,
      totalPossible: session.total_possible,
    })
  } catch (e: any) {
    console.error('[grade-open-ended]', e?.message)
    return NextResponse.json({ error: 'Bir hata oluştu, tekrar dene.' }, { status: 500 })
  }
}
