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
  const { weakTopics } = body

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Sen bir eğitim koçusun. ${profile?.name} adlı ${profile?.grade} öğrencisi için analiz yap.

Zayıf konular: ${weakTopics}

Şunları yaz (${profile?.language || 'Türkçe'} dilinde):
1. Bu konulardaki genel zayıflığın nedenini kısaca açıkla (2-3 cümle)
2. Her konu için 1 pratik çalışma önerisi ver
3. Öncelikli odaklanılması gereken konuyu belirt

Kısa ve motive edici yaz. Maksimum 200 kelime.`,
    }],
  }) as any

  return NextResponse.json({ analysis: message.content[0].text })
}
