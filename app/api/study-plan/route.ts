import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60
export const runtime = 'nodejs'

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

  // Kullanicinin notlarini cek
  const { data: notesData } = await supabase
    .from('user_notes')
    .select('content')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(5)
  const userNotes = notesData?.map((n: any) => n.content).join('\n---\n') || ''

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Sen bir egitim kocusun. ${profile?.name} icin 4 haftalik kisisel calisma plani olustur.
Profil: ${profile?.grade}
Ortalama basari: %${avgPct}
Toplam test: ${totalTests}
Zayif konular: ${weakTopics || 'Henuz belirlenmedi'}
Kullanicinin kendi notlari (MUTLAKA dikkate al): ${userNotes || 'Not girilmemis'}
Dil: ${profile?.language || 'Turkce'}

SADECE JSON don:
{"summary":"2-3 cumle","weeks":[{"week":1,"goal":"hedef","topics":["konu1"],"daily_minutes":20,"focus":"odak"}],"motivation":"motivasyon"}`,
    }],
  }) as any

  try {
    const raw = message.content[0].text.replace(/```json|```/g, '').trim()
    const plan = JSON.parse(raw)
    return NextResponse.json({ plan })
  } catch {
    return NextResponse.json({ error: 'Plan olusturulamadi.' }, { status: 500 })
  }
}
