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
  // Auth kontrolü
  // Guest (landing page) için auth opsiyonel
  const authHeader = req.headers.get('authorization')
  const isGuest = !authHeader?.startsWith('Bearer ')

  let botUserId: string | null = null
  if (!isGuest) {
    const token = authHeader!.slice(7)
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ reply: 'Oturum geçersiz.' }, { status: 401 })
    botUserId = user.id
    // Rate limiting — 50 istek/gün (giriş yapmış kullanıcılar)
    try {
      const rlDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const today = new Date().toISOString().split('T')[0]
      const { data: rl } = await rlDb.from('api_rate_limits').select('id, count').eq('user_id', botUserId).eq('endpoint', 'bot').eq('window_date', today).maybeSingle()
      if (rl) {
        if (rl.count >= 50) return NextResponse.json({ reply: 'Günlük bot limiti aşıldı.' }, { status: 429 })
        await rlDb.from('api_rate_limits').update({ count: rl.count + 1 }).eq('id', rl.id)
      } else { await rlDb.from('api_rate_limits').insert({ user_id: botUserId, endpoint: 'bot', count: 1, window_date: today }) }
    } catch { /* devam et */ }
  }

  try {
    const { messages, system } = await req.json()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      system,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply })
  } catch {
    return NextResponse.json({ reply: 'Bir hata olustu, lutfen tekrar dene.' }, { status: 500 })
  }
}
