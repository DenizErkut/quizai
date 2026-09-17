// app/api/admin/coach-analytics/route.ts — Pratium Koç kullanım analitikleri.
//
// 17 Eylül 2026 — Koçun 6 fazı da teslim edildikten sonra Deniz'in
// istediği sıradaki şey: "kaç öğrenci gerçekten kullanıyor, ne kadar
// mesajlaşıyor, önerdiği butona tıklıyor mu?" — pipeline-health zaten AI
// maliyetini görünür kılıyordu (Faz F) ama KULLANIM tarafında hiçbir
// ölçüm yoktu. Bu endpoint admin/pipeline-health ile aynı desende
// (30 günlük pencere, is_admin kontrolü, tek Promise.all) koçun benimsenme
// (adoption), etkileşim (engagement) ve eylem (action click-through)
// ölçümlerini üretiyor.
//
// Önemli: coach_messages kendi user_id'sini taşımıyor (sahiplik
// coach_conversations üzerinden) — bu yüzden conversationId -> userId
// eşlemesi burada elle kuruluyor.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [conversationsResult, messagesResult, clicksResult, nudgesResult, sessionsResult] = await Promise.all([
    // Tüm zamanlar — "hiç koçu denedi mi" (adoption) için sınırsız gerekiyor,
    // Faz B bugün teslim edildiğinden hacim henüz küçük.
    db.from('coach_conversations').select('id,user_id,started_at').limit(50000),
    db.from('coach_messages').select('id,conversation_id,role,action,created_at').gte('created_at', since).limit(50000),
    db.from('coach_action_clicks').select('id,user_id,clicked_at').gte('clicked_at', since).limit(50000),
    db.from('notifications').select('id,user_id,created_at').eq('type', 'coach_nudge').gte('created_at', since).limit(50000),
    db.from('quiz_sessions').select('user_id').eq('completed', true).limit(50000),
  ])
  const errors = [conversationsResult.error, messagesResult.error, clicksResult.error, nudgesResult.error, sessionsResult.error].filter(Boolean)
  if (errors.length) return NextResponse.json({ error: 'Koç analitikleri alınamadı.' }, { status: 500 })

  const conversations = conversationsResult.data ?? []
  const messages = messagesResult.data ?? []
  const clicks = clicksResult.data ?? []
  const nudges = nudgesResult.data ?? []
  const sessions = sessionsResult.data ?? []

  const userIdByConversation = new Map(conversations.map(c => [c.id, c.user_id]))
  const eligibleStudents = new Set(sessions.map(row => row.user_id).filter(Boolean))
  const totalOpeners = new Set(conversations.map(c => c.user_id))
  const sinceMs = new Date(since).getTime()
  const newOpeners30d = new Set(conversations.filter(c => new Date(c.started_at).getTime() >= sinceMs).map(c => c.user_id))

  const userMessages = messages.filter(m => m.role === 'user')
  const activeUsers30d = new Set(userMessages.map(m => userIdByConversation.get(m.conversation_id)).filter(Boolean))
  const assistantWithAction = messages.filter(m => m.role === 'assistant' && m.action)

  const adoptionRate = eligibleStudents.size ? totalOpeners.size / eligibleStudents.size : null
  const avgMessagesPerActiveUser = activeUsers30d.size ? userMessages.length / activeUsers30d.size : null
  const clickThroughRate = assistantWithAction.length ? clicks.length / assistantWithAction.length : null

  return NextResponse.json({
    period_days: 30,
    generated_at: new Date().toISOString(),
    adoption: {
      eligible_students: eligibleStudents.size,
      total_openers: totalOpeners.size,
      new_openers_30d: newOpeners30d.size,
      adoption_rate: adoptionRate,
    },
    engagement: {
      active_users_30d: activeUsers30d.size,
      total_user_messages_30d: userMessages.length,
      avg_messages_per_active_user: avgMessagesPerActiveUser,
    },
    actions: {
      suggested_30d: assistantWithAction.length,
      clicked_30d: clicks.length,
      click_through_rate: clickThroughRate,
    },
    proactive: {
      nudges_sent_30d: nudges.length,
    },
  })
}
