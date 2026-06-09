import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 30
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic()
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  // Rate limiting — 20 istek/gün
  try {
    const rlDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const today = new Date().toISOString().split('T')[0]
    const { data: rl } = await rlDb.from('api_rate_limits').select('id, count').eq('user_id', user.id).eq('endpoint', 'topic-summary').eq('window_date', today).maybeSingle()
    if (rl) {
      if (rl.count >= 20) return NextResponse.json({ error: 'Günlük özet limiti aşıldı.', limit: 20 }, { status: 429 })
      await rlDb.from('api_rate_limits').update({ count: rl.count + 1 }).eq('id', rl.id)
    } else { await rlDb.from('api_rate_limits').insert({ user_id: user.id, endpoint: 'topic-summary', count: 1, window_date: today }) }
  } catch { /* devam et */ }

  const { topic, grade, language = 'Türkçe' } = await req.json()
  if (!topic) return NextResponse.json({ error: 'Konu belirtilmedi.' }, { status: 400 })

  const prompt = `Sen bir öğretmensin. "${topic}" konusunu ${grade || 'ortaokul'} seviyesinde bir öğrenciye quiz öncesi hızlıca özetleyeceksin.

Dil: ${language}

SADECE JSON döndür:
{
  "summary": "2-3 cümlelik genel özet",
  "keyPoints": ["Madde 1", "Madde 2", "Madde 3", "Madde 4", "Madde 5"],
  "keyTerms": [
    {"term": "Terim 1", "definition": "Kısa tanım"},
    {"term": "Terim 2", "definition": "Kısa tanım"},
    {"term": "Terim 3", "definition": "Kısa tanım"}
  ],
  "rememberThis": "Sınava girerken aklında tut: En önemli tek cümle"
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: 'Sadece geçerli JSON döndür, markdown kullanma.',
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Özet oluşturulamadı.' }, { status: 500 })
  }
}
