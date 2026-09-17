// app/api/admin/coach-usage/route.ts — Pratium Koç, admin "Koç Kullanımı"
// paneli için ayrıntılı kullanım + maliyet verisi.
//
// 17 Eylül 2026 — Deniz'in isteği: "tüm koç süreçleri admin panelinde
// hazır değil mi, nereye konumlandırdın?" — mevcut CoachAnalytics (Faz G)
// sadece 30 günlük adoption/engagement/click-through oranlarını, Müfredat
// Yönetimi sekmesinin İÇİNE gömülü olarak gösteriyordu; ne kendi sekmesi
// vardı ne de "bugün kaç mesaj / bugün ne kadar maliyet / özel tarih
// aralığı / kullanıcı listesi" gibi somut, operasyonel rakamlar. Bu
// endpoint o boşluğu dolduruyor — kendi admin sekmesinde (bkz.
// app/admin/page.tsx, tab: 'coach-usage') gösteriliyor.
//
// coach_messages kendi user_id'sini taşımıyor (sahiplik
// coach_conversations üzerinden) — conversationId -> userId eşlemesi
// burada elle kuruluyor (coach-analytics route'undaki ile aynı desen).
// Maliyet, ai_usage_logs'taki operation='coach-*' satırlarından geliyor
// (aynı prefiks, app/api/admin/pipeline-health/route.ts'in coach{} bloğuyla
// tutarlı).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function startOfDayUTC(d: Date): Date {
  const x = new Date(d)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

const MAX_RANGE_DAYS = 366

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data: adminProfile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (adminProfile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const url = new URL(req.url)
  const startParam = url.searchParams.get('start')
  const endParam = url.searchParams.get('end')

  const now = new Date()
  const todayStart = startOfDayUTC(now)
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  // Özel tarih aralığı verilmemişse varsayılan: son 7 gün (bugün dahil).
  const rangeStart = startParam ? new Date(`${startParam}T00:00:00.000Z`) : new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000)
  const rangeEnd = endParam ? new Date(`${endParam}T23:59:59.999Z`) : new Date(todayEnd.getTime() - 1)

  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime()) || rangeStart > rangeEnd) {
    return NextResponse.json({ error: 'Geçersiz tarih aralığı.' }, { status: 400 })
  }
  if ((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000) > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `En fazla ${MAX_RANGE_DAYS} günlük aralık sorgulanabilir.` }, { status: 400 })
  }

  const [
    conversationsResult,
    allTimeCostResult,
    todayMessagesResult,
    todayCostResult,
    rangeMessagesResult,
    rangeCostResult,
  ] = await Promise.all([
    db.from('coach_conversations').select('id,user_id').limit(50000),
    db.from('ai_usage_logs').select('cost_usd').ilike('operation', 'coach-%').limit(200000),
    db.from('coach_messages').select('id,conversation_id,created_at').eq('role', 'user')
      .gte('created_at', todayStart.toISOString()).lt('created_at', todayEnd.toISOString()).limit(50000),
    db.from('ai_usage_logs').select('cost_usd').ilike('operation', 'coach-%')
      .gte('created_at', todayStart.toISOString()).lt('created_at', todayEnd.toISOString()).limit(50000),
    db.from('coach_messages').select('id,conversation_id,created_at').eq('role', 'user')
      .gte('created_at', rangeStart.toISOString()).lte('created_at', rangeEnd.toISOString()).limit(200000),
    db.from('ai_usage_logs').select('cost_usd,created_at').ilike('operation', 'coach-%')
      .gte('created_at', rangeStart.toISOString()).lte('created_at', rangeEnd.toISOString()).limit(200000),
  ])

  const errors = [conversationsResult, allTimeCostResult, todayMessagesResult, todayCostResult, rangeMessagesResult, rangeCostResult]
    .map(r => r.error).filter(Boolean)
  if (errors.length) return NextResponse.json({ error: 'Koç kullanım verileri alınamadı.' }, { status: 500 })

  const conversations = conversationsResult.data ?? []
  const userIdByConversation = new Map(conversations.map(c => [c.id, c.user_id]))
  const totalCoachUsersAllTime = new Set(conversations.map(c => c.user_id)).size
  const allTimeCostUsd = (allTimeCostResult.data ?? []).reduce((s, r: any) => s + Number(r.cost_usd || 0), 0)

  const todayMessages = todayMessagesResult.data ?? []
  const todayCostUsd = (todayCostResult.data ?? []).reduce((s, r: any) => s + Number(r.cost_usd || 0), 0)
  const todayActiveUsers = new Set(todayMessages.map(m => userIdByConversation.get(m.conversation_id)).filter(Boolean))

  const rangeMessages = rangeMessagesResult.data ?? []
  const rangeCostRows = rangeCostResult.data ?? []
  const rangeCostUsd = rangeCostRows.reduce((s, r: any) => s + Number(r.cost_usd || 0), 0)
  const rangeActiveUserIds = new Set(
    rangeMessages.map(m => userIdByConversation.get(m.conversation_id)).filter(Boolean) as string[]
  )

  // Günlük kırılım (aralık içinde) — grafik/tablo için.
  const dailyMap = new Map<string, { messages: number; cost_usd: number }>()
  for (const m of rangeMessages) {
    const k = dayKey(m.created_at)
    const e = dailyMap.get(k) || { messages: 0, cost_usd: 0 }
    e.messages += 1
    dailyMap.set(k, e)
  }
  for (const c of rangeCostRows as any[]) {
    const k = dayKey(c.created_at)
    const e = dailyMap.get(k) || { messages: 0, cost_usd: 0 }
    e.cost_usd += Number(c.cost_usd || 0)
    dailyMap.set(k, e)
  }
  const daily = Array.from(dailyMap.entries())
    .map(([date, v]) => ({ date, messages: v.messages, cost_usd: Number(v.cost_usd.toFixed(4)) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Kullanıcı bazlı liste — aralık içinde en az 1 mesaj göndermiş herkes.
  const rangeMessagesByUser = new Map<string, number>()
  const lastMessageAtByUser = new Map<string, string>()
  for (const m of rangeMessages) {
    const uid = userIdByConversation.get(m.conversation_id)
    if (!uid) continue
    rangeMessagesByUser.set(uid, (rangeMessagesByUser.get(uid) || 0) + 1)
    const prev = lastMessageAtByUser.get(uid)
    if (!prev || m.created_at > prev) lastMessageAtByUser.set(uid, m.created_at)
  }
  const involvedUserIds = Array.from(rangeActiveUserIds)

  let profileById = new Map<string, any>()
  if (involvedUserIds.length) {
    const { data: profileRows } = await db.from('profiles').select('id,name,surname,plan,grade').in('id', involvedUserIds)
    profileById = new Map((profileRows ?? []).map((p: any) => [p.id, p]))
  }

  const users = involvedUserIds
    .map(uid => {
      const p = profileById.get(uid)
      return {
        user_id: uid,
        name: p ? [p.name, p.surname].filter(Boolean).join(' ') || null : null,
        plan: p?.plan ?? null,
        grade: p?.grade ?? null,
        messages_in_range: rangeMessagesByUser.get(uid) || 0,
        last_message_at: lastMessageAtByUser.get(uid) || null,
      }
    })
    .sort((a, b) => b.messages_in_range - a.messages_in_range)
    .slice(0, 500)

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    all_time: {
      total_coach_users: totalCoachUsersAllTime,
      total_cost_usd: Number(allTimeCostUsd.toFixed(4)),
    },
    today: {
      date: todayStart.toISOString().slice(0, 10),
      messages: todayMessages.length,
      cost_usd: Number(todayCostUsd.toFixed(4)),
      active_users: todayActiveUsers.size,
    },
    range: {
      start: rangeStart.toISOString().slice(0, 10),
      end: rangeEnd.toISOString().slice(0, 10),
      messages: rangeMessages.length,
      cost_usd: Number(rangeCostUsd.toFixed(4)),
      active_users: rangeActiveUserIds.size,
      avg_cost_per_message_usd: rangeMessages.length ? Number((rangeCostUsd / rangeMessages.length).toFixed(6)) : null,
      daily,
      users_truncated: involvedUserIds.length > 500,
    },
    users,
  })
}
