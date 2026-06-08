import { NextRequest, NextResponse } from 'next/server'
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

  if (!isGuest) {
    const token = authHeader!.slice(7)
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return NextResponse.json({ reply: 'Oturum geçersiz.' }, { status: 401 })
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
