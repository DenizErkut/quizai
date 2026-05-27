// app/api/ai-grade-analysis/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
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

  const { gradeNotes } = await req.json()
  if (!gradeNotes) return NextResponse.json({ error: 'Veri eksik.' }, { status: 400 })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Sen deneyimli bir Türk eğitim danışmanısın. Öğrencinin karne notlarını analiz et ve kısa, pratik öneriler sun.

Karne Notları:
${gradeNotes}

Lütfen şu formatta Türkçe analiz yaz:

**💪 En Güçlü Dersler**
(En yüksek ortalamalı 1-2 ders)

**⚠️ Öncelikli Çalışılacak Dersler**
(70 altında olan dersler, neden zayıf olabileceği ve ne yapılmalı)

**🎯 Bu Hafta İçin Öneri**
(Somut 3 adım: hangi dersten, hangi konudan başlanmalı)

**📈 Hedef**
(Genel ortalama yorumu ve ulaşılabilir kısa vadeli hedef)

Kısa ve motive edici tut, maksimum 250 kelime.`
    }],
  })

  const analysis = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ analysis })
}
