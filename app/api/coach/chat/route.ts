// app/api/coach/chat/route.ts — Pratium Koç, Faz B: çok turlu sohbet endpoint'i.
//
// 17 Eylül 2026 — /api/ai-analysis'in yerini alacak yeni nesil koç akışı
// (o endpoint ve /analysis sayfasındaki tek seferlik "AI Çalışma Planı"
// kutusu şimdilik olduğu gibi bırakıldı, kaldırılmadı). Farkı: konuşma
// hafızası var (coach_conversations/coach_messages) ve bağlam HER
// istekte sunucu tarafında lib/coach-context.ts ile taze hesaplanıyor —
// istemciden gelen hiçbir istatistiğe güvenilmiyor.
//
// GET  → kullanıcının aktif konuşmasını (yoksa oluşturarak) ve mesaj
//        geçmişini döner. Konuşma yeni açıldıysa (hiç mesaj yoksa) gerçek
//        veriye dayanan proaktif bir açılış mesajı üretip kaydeder — bu,
//        mockup'taki "Bu hafta +%18 ilerleme" tarzı karşılamanın temelini
//        atar (tam proaktif bildirim/cron entegrasyonu Faz D'de).
// POST → kullanıcının mesajını kaydeder, koçun yanıtını üretir ve döner.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentityBySupabaseId } from '@/lib/identity/client'
import { buildCoachContext, formatCoachContextForPrompt, CoachContext } from '@/lib/coach-context'
import { logAnthropicUsage } from '@/lib/ai-usage'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60
export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const COACH_MODEL = 'claude-sonnet-4-5'

// Bağlam penceresini ve maliyeti sınırlı tutmak için son N mesaj yeterli —
// koç zaten her turda taze hesaplanan gerçek veriye bakıyor, uzun
// geçmişe ihtiyacı yok.
const MAX_HISTORY_MESSAGES = 20
const MAX_USER_MESSAGE_LENGTH = 2000
// Basit maliyet koruması: konuşma başına günlük kullanıcı mesajı sınırı.
const DAILY_USER_MESSAGE_LIMIT = 40

function authClient(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any
}

function buildSystemPrompt(ctx: CoachContext): string {
  return `Sen Pratium'un yapay zeka destekli kişisel öğrenme koçusun. Adın "Pratium Koç".

Bu genel bir sohbet asistanı DEĞİL — sadece aşağıdaki, sistem tarafından hesaplanmış GERÇEK öğrenci verisine dayanarak konuşuyorsun.

ÖĞRENCİ VERİSİ (gerçek, bu isteğe özel taze hesaplandı):
${formatCoachContextForPrompt(ctx)}

YANIT TARZI:
- Sıcak, samimi, motive edici — asla soğuk, robotik veya yargılayıcı değil
- Kısa: maksimum 3-4 cümle
- Somut ol: yukarıdaki veriden en az bir gerçek konu adı, sayı veya gözlem kullan
- Mümkünse tek bir somut sonraki adım öner (örn. "X konusunda kısa bir tekrar yapabilirsin")

KESİN KURAL:
- Yukarıdaki veri bloğunda YER ALMAYAN hiçbir istatistik, başarı, konu adı veya karşılaştırma UYDURMA
- Veri yetersizse ("henüz test yok", "öncelikli konu yok" gibi) bunu olduğu gibi söyle, uydurarak doldurma

SINIRLAR:
- Senden bir soruyu/problemi çözmen istenirse çözme: "Bunu Pratium'da bir test olarak çözersen çok daha etkili öğrenirsin" de ve Yeni Test'e yönlendir
- Düşük performansı asla olumsuz/utandırıcı bir çerçevede sunma; dürüst ama destekleyici ol

Kullanıcı Türkçe yazarsa Türkçe, İngilizce yazarsa İngilizce yanıt ver.`
}

async function callCoach(ctx: CoachContext, history: { role: 'user' | 'assistant'; content: string }[], userId: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: COACH_MODEL,
    max_tokens: 400,
    system: buildSystemPrompt(ctx),
    messages: history.length ? history : [{ role: 'user', content: 'Merhaba' }],
  }) as any
  await logAnthropicUsage('coach-chat', COACH_MODEL, message, { userId })
  return message.content?.[0]?.text ?? ''
}

async function generateOpeningMessage(ctx: CoachContext, userId: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: COACH_MODEL,
    max_tokens: 300,
    system: buildSystemPrompt(ctx),
    messages: [{
      role: 'user',
      content: 'Bu, öğrencinin bugün seninle ilk karşılaşması. Yukarıdaki gerçek veriye dayanarak, onu karşılayan ve en dikkat çekici tek sinyali (seri, gerileme veya en öncelikli çalışma önerisi) vurgulayan kısa bir açılış mesajı yaz. Soru sorup bekleme, doğrudan yaz.',
    }],
  }) as any
  await logAnthropicUsage('coach-chat-opening', COACH_MODEL, message, { userId })
  return message.content?.[0]?.text ?? 'Merhaba! Bugün nasıl gidiyor?'
}

async function getOrCreateConversation(supabase: any, userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('coach_conversations')
    .select('id')
    .eq('user_id', userId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data: created, error } = await supabase
    .from('coach_conversations')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (error || !created) throw new Error('coach_conversation_create_failed')
  return created.id as string
}

async function loadCoachContext(supabase: any, userId: string): Promise<CoachContext> {
  const { data: profile } = await supabase.from('profiles').select('grade,language').eq('id', userId).single()
  const identity = await getIdentityBySupabaseId(userId)
  return buildCoachContext(supabase, userId, {
    displayName: identity?.full_name ?? 'Öğrenci',
    grade: profile?.grade,
    language: profile?.language,
  })
}

export async function GET(req: NextRequest) {
  const supabase = authClient(req)
  if (!supabase) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  try {
    const conversationId = await getOrCreateConversation(supabase, user.id)
    const { data: messages } = await supabase
      .from('coach_messages')
      .select('id, role, content, action, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY_MESSAGES)

    if (!messages || messages.length === 0) {
      const ctx = await loadCoachContext(supabase, user.id)
      const opening = await generateOpeningMessage(ctx, user.id)
      const { data: inserted, error } = await supabase
        .from('coach_messages')
        .insert({ conversation_id: conversationId, role: 'assistant', content: opening })
        .select('id, role, content, action, created_at')
        .single()
      if (error) throw error
      await supabase.from('coach_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)
      return NextResponse.json({ conversationId, messages: [inserted] })
    }

    return NextResponse.json({ conversationId, messages })
  } catch (err) {
    console.error('[coach-chat] GET error:', err)
    return NextResponse.json({ error: 'Koç yüklenemedi.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const supabase = authClient(req)
  if (!supabase) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const userMessage = typeof body.message === 'string' ? body.message.trim() : ''
  if (!userMessage) return NextResponse.json({ error: 'Mesaj gerekli.' }, { status: 400 })
  if (userMessage.length > MAX_USER_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'Mesaj çok uzun.' }, { status: 400 })
  }

  try {
    const conversationId = await getOrCreateConversation(supabase, user.id)

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const { count: todayCount } = await supabase
      .from('coach_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .gte('created_at', startOfDay.toISOString())
    if ((todayCount ?? 0) >= DAILY_USER_MESSAGE_LIMIT) {
      return NextResponse.json({ error: 'Bugünlük koç mesaj sınırına ulaştın, yarın devam edebilirsin.' }, { status: 429 })
    }

    const { error: insertUserErr } = await supabase
      .from('coach_messages')
      .insert({ conversation_id: conversationId, role: 'user', content: userMessage })
    if (insertUserErr) throw insertUserErr

    const ctx = await loadCoachContext(supabase, user.id)

    const { data: history } = await supabase
      .from('coach_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY_MESSAGES)

    const reply = await callCoach(ctx, (history ?? []) as { role: 'user' | 'assistant'; content: string }[], user.id)

    const { data: inserted, error: insertAssistantErr } = await supabase
      .from('coach_messages')
      .insert({ conversation_id: conversationId, role: 'assistant', content: reply })
      .select('id, role, content, action, created_at')
      .single()
    if (insertAssistantErr) throw insertAssistantErr

    await supabase.from('coach_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)

    return NextResponse.json({ conversationId, message: inserted })
  } catch (err) {
    console.error('[coach-chat] POST error:', err)
    return NextResponse.json({ error: 'Koç yanıt veremedi, lütfen tekrar dene.' }, { status: 500 })
  }
}
