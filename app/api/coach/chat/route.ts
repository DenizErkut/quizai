// app/api/coach/chat/route.ts — Pratium Koç, Faz B/C: çok turlu sohbet
// endpoint'i + eyleme geçirilebilir mesajlar.
//
// 17 Eylül 2026 — /api/ai-analysis'in yerini alacak yeni nesil koç akışı
// (o endpoint ve /analysis sayfasındaki tek seferlik "AI Çalışma Planı"
// kutusu şimdilik olduğu gibi bırakıldı, kaldırılmadı). Farkı: konuşma
// hafızası var (coach_conversations/coach_messages), bağlam HER istekte
// sunucu tarafında lib/coach-context.ts ile taze hesaplanıyor (istemciden
// gelen hiçbir istatistiğe güvenilmiyor), ve koç somut bir çalışma
// önerdiğinde bunu bir `action` (lib/coach-generation.ts, Faz C) olarak
// da dönebiliyor — UI bunu gerçek bir butona çeviriyor.
//
// GET  → kullanıcının aktif konuşmasını (yoksa oluşturarak) ve mesaj
//        geçmişini döner. Konuşma yeni açıldıysa (hiç mesaj yoksa) gerçek
//        veriye dayanan proaktif bir açılış mesajı üretip kaydeder.
// POST → kullanıcının mesajını kaydeder, koçun yanıtını (+ varsa action'ı)
//        üretir ve döner.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentityBySupabaseId } from '@/lib/identity/client'
import { buildCoachContext, CoachContext } from '@/lib/coach-context'
import { generateCoachReply, generateCoachOpening, getCoachDailyMessageLimit } from '@/lib/coach-generation'
import { isPaidCoachPlan, COACH_PLAN_REQUIRED_MESSAGE } from '@/lib/coach-access'

export const maxDuration = 60
export const runtime = 'nodejs'

// Bağlam penceresini ve maliyeti sınırlı tutmak için son N mesaj yeterli —
// koç zaten her turda taze hesaplanan gerçek veriye bakıyor, uzun
// geçmişe ihtiyacı yok.
const MAX_HISTORY_MESSAGES = 20
const MAX_USER_MESSAGE_LENGTH = 2000

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
) as any

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

  // Koç sadece ücretli üyelere açık — ücretsiz (free) planda hiç
  // konuşma oluşturulmuyor, hiç Claude çağrısı yapılmıyor.
  const { data: accessPlanRow } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle()
  if (!isPaidCoachPlan(accessPlanRow?.plan)) {
    return NextResponse.json({ error: COACH_PLAN_REQUIRED_MESSAGE, code: 'plan_required' }, { status: 403 })
  }

  try {
    const conversationId = await getOrCreateConversation(supabaseAdmin, user.id)
    const { data: messages } = await supabaseAdmin
      .from('coach_messages')
      .select('id, role, content, action, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY_MESSAGES)

    if (!messages || messages.length === 0) {
      const ctx = await loadCoachContext(supabaseAdmin, user.id)
      const opening = await generateCoachOpening(ctx, user.id, 'coach-chat-opening')
      const { data: inserted, error } = await supabaseAdmin
        .from('coach_messages')
        .insert({ conversation_id: conversationId, role: 'assistant', content: opening.text, action: opening.action })
        .select('id, role, content, action, created_at')
        .single()
      if (error) throw error
      await supabaseAdmin.from('coach_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)
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

  const { data: planRow } = await supabase.from('profiles').select('plan').eq('id', user.id).maybeSingle()
  // Koç sadece ücretli üyelere açık — free planda GET zaten engelliyor,
  // ama POST'a doğrudan istek atılırsa diye burada da tekrar kontrol edilir.
  if (!isPaidCoachPlan(planRow?.plan)) {
    return NextResponse.json({ error: COACH_PLAN_REQUIRED_MESSAGE, code: 'plan_required' }, { status: 403 })
  }

  try {
    const conversationId = await getOrCreateConversation(supabaseAdmin, user.id)

    const dailyLimit = getCoachDailyMessageLimit(planRow?.plan)

    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const { count: todayCount } = await supabaseAdmin
      .from('coach_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .gte('created_at', startOfDay.toISOString())
    if ((todayCount ?? 0) >= dailyLimit) {
      const upsellHint = planRow?.plan === 'premium' || planRow?.plan === 'unlimited'
        ? ''
        : ' Daha yüksek bir plana geçerek günlük mesaj hakkını artırabilirsin.'
      return NextResponse.json({ error: `Bugünlük koç mesaj sınırına ulaştın, yarın devam edebilirsin.${upsellHint}` }, { status: 429 })
    }

    const { error: insertUserErr } = await supabaseAdmin
      .from('coach_messages')
      .insert({ conversation_id: conversationId, role: 'user', content: userMessage })
    if (insertUserErr) throw insertUserErr

    const ctx = await loadCoachContext(supabaseAdmin, user.id)

    const { data: history } = await supabaseAdmin
      .from('coach_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(MAX_HISTORY_MESSAGES)

    const reply = await generateCoachReply(ctx, (history ?? []) as { role: 'user' | 'assistant'; content: string }[], user.id, 'coach-chat')

    const { data: inserted, error: insertAssistantErr } = await supabaseAdmin
      .from('coach_messages')
      .insert({ conversation_id: conversationId, role: 'assistant', content: reply.text, action: reply.action })
      .select('id, role, content, action, created_at')
      .single()
    if (insertAssistantErr) throw insertAssistantErr

    await supabaseAdmin.from('coach_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)

    return NextResponse.json({ conversationId, message: inserted })
  } catch (err) {
    console.error('[coach-chat] POST error:', err)
    return NextResponse.json({ error: 'Koç yanıt veremedi, lütfen tekrar dene.' }, { status: 500 })
  }
}
