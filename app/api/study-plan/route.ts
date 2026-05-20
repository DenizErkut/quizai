import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('name,grade,language').eq('id', user.id).single()
  const body = await req.json()
  const { weakTopics, avgPct, totalTests } = body

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Sen bir eğitim koçusun. ${profile?.name} için 4 haftalık kişisel çalışma planı oluştur.

Profil: ${profile?.grade}
Ortalama başarı: %${avgPct}
Toplam test: ${totalTests}
Zayıf konular: ${weakTopics || 'Henüz belirlenmedi'}
Dil: ${profile?.language || 'Türkçe'}

SADECE JSON döndür:
{
  "summary": "2-3 cümle genel değerlendirme",
  "weeks": [
    {
      "week": 1,
      "goal": "Hafta hedefi",
      "topics": ["konu1", "konu2"],
      "daily_minutes": 20,
      "focus": "Bu hafta özellikle dikkat edilecek nokta"
    }
  ],
  "motivation": "Kısa motivasyon cümlesi"
}`,
    }],
  }) as any

  try {
    const raw = message.content[0].text.replace(/```json|```/g, '').trim()
    const plan = JSON.parse(raw)
    return NextResponse.json({ plan })
  } catch {
    return NextResponse.json({ error: 'Plan oluşturulamadı.' }, { status: 500 })
  }
}
