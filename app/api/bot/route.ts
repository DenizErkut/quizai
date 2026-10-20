import { CLAUDE_SONNET, SONNET_PARAMS, responseText, sonnetTokens } from '@/lib/claude-models'
import { NextRequest, NextResponse } from 'next/server'
export const maxDuration = 30
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server-create-client'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { checkRateLimit } from '@/lib/rate-limit'

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ reply: 'Servis yapılandırması eksik.' }, { status: 503 })
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
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
    // Rate limiting — 50 istek/gün (atomik RPC; doğrulanamazsa kapalı)
    const limit = await checkRateLimit(botUserId, { endpoint: 'bot', limit: 50 })
    if (!limit.allowed) {
      return NextResponse.json({ reply: limit.unavailable ? 'İstek sınırı doğrulanamadı. Lütfen biraz sonra tekrar dene.' : 'Günlük bot limiti aşıldı.' }, { status: limit.unavailable ? 503 : 429 })
    }
  }

  try {
    const body = await req.json()
    // Girdi sınırları: son 20 mesaj, mesaj başına 2000 karakter, yalnızca user/assistant rolleri.
    const rawMessages: unknown[] = Array.isArray(body?.messages) ? body.messages.slice(-20) : []
    const messages = rawMessages
      .filter((m): m is { role: 'user' | 'assistant'; content: string } => {
        const item = m as { role?: unknown; content?: unknown } | null
        return Boolean(item) && (item!.role === 'user' || item!.role === 'assistant') && typeof item!.content === 'string' && item!.content.length > 0
      })
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
    while (messages.length && messages[0].role === 'assistant') messages.shift()
    if (!messages.length) return NextResponse.json({ reply: 'Geçersiz istek.' }, { status: 400 })
    const system = typeof body?.system === 'string' ? body.system.slice(0, 12000) : undefined

    const response = await anthropic.messages.create({
      model: CLAUDE_SONNET, ...SONNET_PARAMS,
      max_tokens: sonnetTokens(512),
      system,
      messages,
    })

    await logAnthropicUsage('bot', CLAUDE_SONNET, response, { userId: botUserId })
    const reply = responseText(response)
    return NextResponse.json({ reply })
  } catch {
    return NextResponse.json({ reply: 'Bir hata olustu, lutfen tekrar dene.' }, { status: 500 })
  }
}
